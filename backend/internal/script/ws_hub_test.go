package script

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestWSProgressHub_RegisterBroadcastUnregister(t *testing.T) {
	hub := NewWSProgressHub()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go hub.Run(ctx)

	// Create mock clients for task-1 and task-2
	client1 := &client{
		taskID: "task-1",
		send:   make(chan ProgressUpdate, 10),
		hub:    hub,
	}
	client2 := &client{
		taskID: "task-1",
		send:   make(chan ProgressUpdate, 10),
		hub:    hub,
	}
	client3 := &client{
		taskID: "task-2",
		send:   make(chan ProgressUpdate, 10),
		hub:    hub,
	}

	hub.register <- client1
	hub.register <- client2
	hub.register <- client3

	update1 := ProgressUpdate{
		TaskID:   "task-1",
		Progress: 50,
		Message:  "halfway",
		Timestamp: time.Now(),
	}

	hub.Broadcast(update1)

	select {
	case u := <-client1.send:
		assert.Equal(t, "task-1", u.TaskID)
		assert.Equal(t, 50, u.Progress)
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timeout waiting for update on client1")
	}

	select {
	case u := <-client2.send:
		assert.Equal(t, "task-1", u.TaskID)
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timeout waiting for update on client2")
	}

	select {
	case <-client3.send:
		t.Fatal("task-2 client should not receive task-1 update")
	case <-time.After(100 * time.Millisecond):
	}

	update2 := ProgressUpdate{
		TaskID:   "task-2",
		Progress: 100,
		Message:  "done",
		Timestamp: time.Now(),
	}

	hub.Broadcast(update2)

	select {
	case u := <-client3.send:
		assert.Equal(t, "task-2", u.TaskID)
		assert.Equal(t, 100, u.Progress)
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timeout waiting for update on client3")
	}

	select {
	case <-client1.send:
		t.Fatal("task-1 client should not receive task-2 update")
	case <-time.After(100 * time.Millisecond):
	}

	hub.unregister <- client1
	hub.unregister <- client2
	hub.unregister <- client3
}

func TestWSProgressHub_ClientLifecycle(t *testing.T) {
	hub := NewWSProgressHub()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go hub.Run(ctx)

	// Test that Register/Unregister work without actual connections
	client1 := &client{
		taskID: "task-1",
		send:   make(chan ProgressUpdate, 10),
		hub:    hub,
	}
	client2 := &client{
		taskID: "task-2",
		send:   make(chan ProgressUpdate, 10),
		hub:    hub,
	}

	hub.register <- client1
	hub.register <- client2

	hub.Broadcast(ProgressUpdate{
		TaskID:   "task-1",
		Progress: 10,
		Message:  "start",
		Timestamp: time.Now(),
	})

	select {
	case u := <-client1.send:
		_ = u
		assert.Equal(t, "task-1", u.TaskID)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("client1 did not receive broadcast")
	}

	select {
	case <-client2.send:
		t.Fatal("client2 should not receive task-1 broadcast")
	case <-time.After(50 * time.Millisecond):
	}

	hub.unregister <- client1
	hub.unregister <- client2
}