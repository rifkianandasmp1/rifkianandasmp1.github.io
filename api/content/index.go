// Vercel Go Function for /api/content — see backend.Content and docs/api-contract.md.
package handler

import (
	"net/http"

	"github.com/rifkianandasmp1/portfolio/backend"
)

var serve = backend.Serve(backend.Content)

func Handler(w http.ResponseWriter, r *http.Request) { serve(w, r) }
