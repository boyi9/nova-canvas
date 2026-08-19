package script

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type WSProgressHub struct {
	mu           sync.RWMutex
	subscriptions map[string]map[*client]bool
	broadcast    chan ProgressUpdate
	register     chan *client
	unregister   chan *client
}

type client struct {
	conn     *websocket.Conn
	taskID   string
	send     chan ProgressUpdate
	hub      *WSProgressHub
}

func NewWSProgressHub() *WSProgressHub {
	return &WSProgressHub{
		subscriptions: make(map[string]map[*client]bool),
		broadcast:     make(chan ProgressUpdate, 256),
		register:      make(chan *client),
		unregister:    make(chan *client),
	}
}

func (h *WSProgressHub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case c := <-h.register:
			h.mu.Lock()
			if h.subscriptions[c.taskID] == nil {
				h.subscriptions[c.taskID] = make(map[*client]bool)
			}
			h.subscriptions[c.taskID][c] = true
			h.mu.Unlock()
		case c := <-h.unregister:
			h.mu.Lock()
			if clients, ok := h.subscriptions[c.taskID]; ok {
				delete(clients, c)
				if len(clients) == 0 {
					delete(h.subscriptions, c.taskID)
				}
			}
			h.mu.Unlock()
			close(c.send)
		case update := <-h.broadcast:
			h.mu.RLock()
			if clients, ok := h.subscriptions[update.TaskID]; ok {
				for c := range clients {
					select {
					case c.send <- update:
					default:
						delete(h.subscriptions[update.TaskID], c)
						close(c.send)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *WSProgressHub) Register(conn *websocket.Conn, taskID string) *client {
	c := &client{
		conn:   conn,
		taskID: taskID,
		send:   make(chan ProgressUpdate, 64),
		hub:    h,
	}
	h.register <- c

	go c.writePump()
	go c.readPump()

	return c
}

func (h *WSProgressHub) Broadcast(update ProgressUpdate) {
	select {
	case h.broadcast <- update:
	default:
		log.Printf("[WS] Broadcast channel full, dropping update for task %s", update.TaskID)
	}
}

func (h *WSProgressHub) Subscribe(taskID string) chan ProgressUpdate {
	ch := make(chan ProgressUpdate, 64)
	h.mu.Lock()
	if h.subscriptions[taskID] == nil {
		h.subscriptions[taskID] = make(map[*client]bool)
	}
	h.mu.Unlock()

	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case update := <-ch:
				h.Broadcast(update)
			case <-ticker.C:
			}
		}
	}()
	return ch
}

func (h *WSProgressHub) Unsubscribe(taskID string) {
	h.mu.Lock()
	delete(h.subscriptions, taskID)
	h.mu.Unlock()
}

func (c *client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(512)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] Read error: %v", err)
			}
			break
		}
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case update, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			data, err := json.Marshal(update)
			if err != nil {
				log.Printf("[WS] Marshal error: %v", err)
				continue
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(data)

			n := len(c.send)
			for i := 0; i < n; i++ {
				nextUpdate := <-c.send
				nextData, _ := json.Marshal(nextUpdate)
				w.Write(nextData)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}