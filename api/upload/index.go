// Vercel Go Function for /api/upload — see backend.Upload and docs/api-contract.md.
package handler

import (
	"net/http"

	"github.com/rifkianandasmp1/portfolio/backend"
)

var serve = backend.Serve(backend.Upload)

func Handler(w http.ResponseWriter, r *http.Request) { serve(w, r) }
