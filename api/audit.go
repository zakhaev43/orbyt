package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"github.com/zakhaev43/orbyt/token"
)

const (
	auditRecordKey  = "audit_record"
	requestIDKey    = "request_id"
	requestIDHeader = "X-Request-ID"

	actionAccessDenied = "access.denied"
)

type auditSpec struct {
	action     string
	targetType string
	// targetParam names the URI parameter holding the target's id, if any.
	targetParam string
}

// auditedRoutes lists every request worth an audit event, keyed by method and
// route pattern: sign-up and sign-in, anything that changes state, and every
// admin read, since admins can see all customers' data. Customer reads of
// their own data are left out; refused access anywhere is always recorded.
var auditedRoutes = map[string]auditSpec{
	"POST /users":                  {action: "user.register", targetType: "user"},
	"POST /users/login":            {action: "auth.login", targetType: "user"},
	"POST /tokens/renew_access":    {action: "auth.token_renew", targetType: "session"},
	"POST /accounts":               {action: "account.open", targetType: "account"},
	"POST /accounts/:id/deposits":  {action: "account.deposit", targetType: "account", targetParam: "id"},
	"POST /accounts/:id/freeze":    {action: "account.freeze", targetType: "account", targetParam: "id"},
	"POST /accounts/:id/unfreeze":  {action: "account.unfreeze", targetType: "account", targetParam: "id"},
	"POST /accounts/:id/close":     {action: "account.close", targetType: "account", targetParam: "id"},
	"POST /transfers":              {action: "transfer.create", targetType: "transaction"},
	"GET /admin/stats":             {action: "admin.stats.view"},
	"GET /admin/activity":          {action: "admin.activity.view"},
	"GET /admin/transactions":      {action: "admin.transactions.view"},
	"GET /admin/users":             {action: "admin.users.view"},
	"GET /admin/accounts":          {action: "admin.accounts.view"},
	"GET /admin/audit-logs":        {action: "admin.audit.view"},
	"GET /admin/audit-logs/verify": {action: "admin.audit.verify"},
}

// auditRecord collects what handlers know about the event beyond the request
// itself: who is acting before they're authenticated, the concrete target,
// and details such as amounts or a status change.
type auditRecord struct {
	actor      string
	targetType string
	targetID   string
	details    map[string]any
}

func auditFor(ctx *gin.Context) *auditRecord {
	if v, ok := ctx.Get(auditRecordKey); ok {
		return v.(*auditRecord)
	}
	rec := &auditRecord{details: map[string]any{}}
	ctx.Set(auditRecordKey, rec)
	return rec
}

// auditActor names the actor on routes without a token, where the username
// comes from the request. It is recorded as claimed, so a failed login shows
// which account was targeted.
func auditActor(ctx *gin.Context, username string) {
	auditFor(ctx).actor = username
}

func auditTarget(ctx *gin.Context, targetType string, id any) {
	rec := auditFor(ctx)
	rec.targetType, rec.targetID = targetType, fmt.Sprint(id)
}

// auditDetail adds context to the event. Never pass secrets: passwords and
// tokens must not reach the audit log.
func auditDetail(ctx *gin.Context, key string, value any) {
	auditFor(ctx).details[key] = value
}

// errorCapture keeps the start of error response bodies so the reason for a
// failure can be recorded without every handler reporting it twice.
type errorCapture struct {
	gin.ResponseWriter
	body bytes.Buffer
}

const maxCapturedBody = 2048

func (w *errorCapture) Write(b []byte) (int, error) {
	if w.Status() >= http.StatusBadRequest && w.body.Len() < maxCapturedBody {
		w.body.Write(b[:min(len(b), maxCapturedBody-w.body.Len())])
	}
	return w.ResponseWriter.Write(b)
}

func (w *errorCapture) reason() string {
	var body struct {
		Error string `json:"error"`
	}
	if json.Unmarshal(w.body.Bytes(), &body) != nil {
		return ""
	}
	return truncate(body.Error, 500)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

// auditMiddleware tags every request with an id (accepting a well-formed
// one from the caller so it can be correlated across services) and, once
// the handler is done, records an audit event for the requests listed in
// auditedRoutes and for every refused request.
//
// The event is written after the response, so a failure to record it is
// logged rather than undoing what the request did.
func (server *Server) auditMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		requestID := ctx.GetHeader(requestIDHeader)
		if !validRequestID.MatchString(requestID) {
			requestID = uuid.NewString()
		}
		ctx.Set(requestIDKey, requestID)
		ctx.Header(requestIDHeader, requestID)

		capture := &errorCapture{ResponseWriter: ctx.Writer}
		ctx.Writer = capture
		start := time.Now()

		ctx.Next()

		status := ctx.Writer.Status()
		spec, audited := auditedRoutes[ctx.Request.Method+" "+ctx.FullPath()]
		if !audited {
			if status != http.StatusForbidden {
				return
			}
			spec = auditSpec{action: actionAccessDenied}
		}

		event := db.AuditEvent{
			OccurredAt: start,
			RequestID:  requestID,
			Action:     spec.action,
			Outcome:    auditOutcome(status),
			TargetType: spec.targetType,
			Method:     ctx.Request.Method,
			Path:       truncate(ctx.Request.URL.Path, 500),
			StatusCode: int32(status),
			Reason:     capture.reason(),
			ClientIP:   ctx.ClientIP(),
			UserAgent:  truncate(ctx.Request.UserAgent(), 500),
		}
		if spec.targetParam != "" {
			event.TargetID = ctx.Param(spec.targetParam)
		}

		details := map[string]any{}
		if v, ok := ctx.Get(authorizationPayloadKey); ok {
			event.Actor = v.(*token.Payload).Username
		}
		if v, ok := ctx.Get(auditRecordKey); ok {
			rec := v.(*auditRecord)
			if event.Actor == "" {
				event.Actor = rec.actor
			}
			if rec.targetType != "" {
				event.TargetType, event.TargetID = rec.targetType, rec.targetID
			}
			details = rec.details
		}
		// What an admin asked to see is part of what they did.
		if ctx.Request.Method == http.MethodGet && ctx.Request.URL.RawQuery != "" {
			details["query"] = truncate(ctx.Request.URL.RawQuery, 500)
		}
		if len(details) > 0 {
			event.Details, _ = json.Marshal(details)
		}

		// Recorded even if the client has gone away.
		writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx.Request.Context()), 5*time.Second)
		defer cancel()
		if _, err := server.store.AppendAuditLog(writeCtx, server.auditKey, event); err != nil {
			log.Printf("audit: could not record %s by %q (request %s): %v", event.Action, event.Actor, requestID, err)
		}
	}
}

func auditOutcome(status int) string {
	switch {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return db.AuditOutcomeDenied
	case status >= http.StatusBadRequest:
		return db.AuditOutcomeFailure
	default:
		return db.AuditOutcomeSuccess
	}
}

type listAuditLogsRequest struct {
	PageSize   int32  `form:"page_size" binding:"required,min=5,max=100"`
	BeforeID   int64  `form:"before_id" binding:"omitempty,min=1"`
	Actor      string `form:"actor" binding:"max=100"`
	Action     string `form:"action" binding:"max=100"`
	Outcome    string `form:"outcome" binding:"omitempty,oneof=success failure denied"`
	TargetType string `form:"target_type" binding:"max=50"`
	TargetID   string `form:"target_id" binding:"max=100"`
	SinceHours int    `form:"since_hours" binding:"omitempty,min=1,max=8784"`
}

type listAuditLogsResponse struct {
	Items []db.AuditLog `json:"items"`
	// NextBeforeID is passed back as before_id for the next (older) page.
	NextBeforeID *int64 `json:"next_before_id"`
}

func (server *Server) listAuditLogs(ctx *gin.Context) {
	var req listAuditLogsRequest
	if err := ctx.ShouldBindQuery(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, errorResponse(err))
		return
	}

	arg := db.ListAuditLogsParams{
		Actor:      optionalString(strings.TrimSpace(req.Actor)),
		Action:     optionalString(strings.TrimSpace(req.Action)),
		Outcome:    optionalString(req.Outcome),
		TargetType: optionalString(strings.TrimSpace(req.TargetType)),
		TargetID:   optionalString(strings.TrimSpace(req.TargetID)),
		PageLimit:  req.PageSize,
	}
	if req.BeforeID > 0 {
		arg.BeforeID.Int64, arg.BeforeID.Valid = req.BeforeID, true
	}
	if req.SinceHours > 0 {
		arg.Since.Time, arg.Since.Valid = time.Now().Add(-time.Duration(req.SinceHours)*time.Hour), true
	}

	rows, err := server.store.ListAuditLogs(ctx, arg)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}

	rsp := listAuditLogsResponse{Items: rows}
	if len(rows) == int(req.PageSize) {
		last := rows[len(rows)-1].ID
		rsp.NextBeforeID = &last
	}
	ctx.JSON(http.StatusOK, rsp)
}

type verifyAuditLogResponse struct {
	db.AuditReport
	VerifiedAt time.Time `json:"verified_at"`
}

func (server *Server) verifyAuditLog(ctx *gin.Context) {
	report, err := server.store.VerifyAuditLog(ctx, server.auditKey)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, errorResponse(err))
		return
	}
	ctx.JSON(http.StatusOK, verifyAuditLogResponse{AuditReport: report, VerifiedAt: time.Now().UTC()})
}
