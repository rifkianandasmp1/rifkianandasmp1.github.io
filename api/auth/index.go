// Vercel Go Function for /api/auth — see backend.Auth and docs/api-contract.md.
package handler

import (
	"net/http"

	"github.com/rifkianandasmp1/portfolio/backend"
)

var serve = backend.Serve(backend.Auth)

func Handler(w http.ResponseWriter, r *http.Request) { serve(w, r) }
