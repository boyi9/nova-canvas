package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"nova-canvas-backend/internal/errs"
	"nova-canvas-backend/internal/workflow"
)

// RunWorkflow executes a submitted workflow graph (nodes + edges + variables)
// through the backend workflow engine and returns per-node results.
func (h *Handler) RunWorkflow(c *gin.Context) {
	var req struct {
		Nodes     []workflow.Node `json:"nodes"`
		Edges     []workflow.Edge `json:"edges"`
		Variables map[string]any  `json:"variables"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		errs.RespondError(c, errs.ErrBadRequest(err.Error()))
		return
	}

	g := workflow.Graph{Nodes: req.Nodes, Edges: req.Edges}
	eng := workflow.DefaultRegistry()
	results, err := eng.Run(c.Request.Context(), g, req.Variables)
	if err != nil {
		errs.RespondError(c, errs.ErrBadRequest("workflow execution failed: "+err.Error()))
		return
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}
