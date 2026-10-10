package backend

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
)

// APIError is returned by handlers and rendered as {"error": "..."} plus any extra fields.
type APIError struct {
	Status  int
	Message string
	Extra   map[string]any
}

func (e *APIError) Error() string { return e.Message }

func errorf(status int, message string) *APIError {
	return &APIError{Status: status, Message: message}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, err error) {
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		log.Printf("internal error: %v", err)
		apiErr = errorf(http.StatusInternalServerError, "Internal server error")
	}
	body := map[string]any{"error": apiErr.Message}
	for k, v := range apiErr.Extra {
		body[k] = v
	}
	writeJSON(w, apiErr.Status, body)
}
