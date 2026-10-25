package db

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/zakhaev43/orbyt/util"
)

const (
	AuditOutcomeSuccess = "success"
	AuditOutcomeFailure = "failure"
	AuditOutcomeDenied  = "denied"
)

// AuditEvent is what the caller knows about an event; the id, chain links and
// seal are assigned by AppendAuditLog.
type AuditEvent struct {
	OccurredAt time.Time
	RequestID  string
	Actor      string
	Action     string
	Outcome    string
	TargetType string
	TargetID   string
	Method     string
	Path       string
	StatusCode int32
	Reason     string
	ClientIP   string
	UserAgent  string
	Details    json.RawMessage
}

// SealAuditLog computes the HMAC-SHA256 seal for a row. It covers every
// column except the seal itself, including prev_hash, so each row vouches for
// the one before it. Fields are JSON-encoded as an array, which keeps the
// encoding unambiguous whatever the values contain.
func SealAuditLog(key []byte, row AuditLog) string {
	fields, _ := json.Marshal([]any{
		row.ID,
		row.OccurredAt.UnixMicro(),
		row.RequestID,
		row.Actor,
		row.Action,
		row.Outcome,
		row.TargetType,
		row.TargetID,
		row.Method,
		row.Path,
		row.StatusCode,
		row.Reason,
		row.ClientIp,
		row.UserAgent,
		string(row.Details),
		row.PrevHash,
	})
	mac := hmac.New(sha256.New, key)
	mac.Write(fields)
	return hex.EncodeToString(mac.Sum(nil))
}

// AppendAuditLog seals the event onto the end of the audit chain. Appends
// are serialised by an advisory lock, so ids always follow chain order.
func (store *SQLStore) AppendAuditLog(ctx context.Context, key []byte, event AuditEvent) (AuditLog, error) {
	details := event.Details
	if len(details) == 0 {
		details = json.RawMessage("{}")
	}
	row := AuditLog{
		// Postgres keeps microseconds; truncating first means the seal
		// covers exactly the timestamp that is read back.
		OccurredAt: event.OccurredAt.UTC().Truncate(time.Microsecond),
		RequestID:  event.RequestID,
		Actor:      event.Actor,
		Action:     event.Action,
		Outcome:    event.Outcome,
		TargetType: event.TargetType,
		TargetID:   event.TargetID,
		Method:     event.Method,
		Path:       event.Path,
		StatusCode: event.StatusCode,
		Reason:     event.Reason,
		ClientIp:   event.ClientIP,
		UserAgent:  event.UserAgent,
		Details:    details,
	}

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return AuditLog{}, err
	}
	defer tx.Rollback()
	q := New(tx)

	if err := q.LockAuditChain(ctx); err != nil {
		return AuditLog{}, err
	}
	row.PrevHash, err = q.GetLastAuditHash(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		row.PrevHash, err = util.GenesisHash, nil
	}
	if err != nil {
		return AuditLog{}, err
	}
	if row.ID, err = q.NextAuditLogID(ctx); err != nil {
		return AuditLog{}, err
	}
	row.Hash = SealAuditLog(key, row)

	created, err := q.CreateAuditLog(ctx, CreateAuditLogParams{
		ID:         row.ID,
		OccurredAt: row.OccurredAt,
		RequestID:  row.RequestID,
		Actor:      row.Actor,
		Action:     row.Action,
		Outcome:    row.Outcome,
		TargetType: row.TargetType,
		TargetID:   row.TargetID,
		Method:     row.Method,
		Path:       row.Path,
		StatusCode: row.StatusCode,
		Reason:     row.Reason,
		ClientIp:   row.ClientIp,
		UserAgent:  row.UserAgent,
		Details:    row.Details,
		PrevHash:   row.PrevHash,
		Hash:       row.Hash,
	})
	if err != nil {
		return AuditLog{}, err
	}
	return created, tx.Commit()
}

// AuditReport is the result of walking the whole audit chain.
type AuditReport struct {
	Valid          bool   `json:"valid"`
	EntriesChecked int    `json:"entries_checked"`
	BrokenEntryID  int64  `json:"broken_entry_id,omitempty"`
	HeadID         int64  `json:"head_id,omitempty"`
	HeadHash       string `json:"head_hash,omitempty"`
}

const auditVerifyBatch = 1000

// VerifyAuditLog recomputes every seal in id order. A row that was edited,
// forged without the key, or removed from the middle breaks the chain at
// that point. Rows cut from the end can only be caught by comparing the head
// with one recorded earlier, which is why the head is reported.
func (store *SQLStore) VerifyAuditLog(ctx context.Context, key []byte) (AuditReport, error) {
	report := AuditReport{Valid: true}
	prevHash := util.GenesisHash
	var afterID int64

	for {
		rows, err := store.ListAuditLogsAfter(ctx, ListAuditLogsAfterParams{AfterID: afterID, PageLimit: auditVerifyBatch})
		if err != nil {
			return report, err
		}
		for _, row := range rows {
			if row.PrevHash != prevHash || !hmac.Equal([]byte(row.Hash), []byte(SealAuditLog(key, row))) {
				report.Valid = false
				report.BrokenEntryID = row.ID
				return report, nil
			}
			report.EntriesChecked++
			report.HeadID, report.HeadHash = row.ID, row.Hash
			prevHash = row.Hash
		}
		if len(rows) < auditVerifyBatch {
			return report, nil
		}
		afterID = rows[len(rows)-1].ID
	}
}
