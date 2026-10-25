package db

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/lib/pq"
	"github.com/stretchr/testify/require"
	"github.com/zakhaev43/orbyt/util"
)

// Fixed so the shared test database's chain verifies across runs.
var testAuditKey = []byte("orbyt-test-audit-key-0123456789abcdef")

func appendTestAuditEvent(t *testing.T, action string) AuditLog {
	row, err := testStore.AppendAuditLog(context.Background(), testAuditKey, AuditEvent{
		OccurredAt: time.Now(),
		RequestID:  util.RandomString(12),
		Actor:      util.RandomOwner(),
		Action:     action,
		Outcome:    AuditOutcomeSuccess,
		TargetType: "account",
		TargetID:   fmt.Sprint(util.RandomInt(1, 1000)),
		Method:     "POST",
		Path:       "/accounts",
		StatusCode: 200,
		ClientIP:   "203.0.113.7",
		UserAgent:  "go-test",
		Details:    json.RawMessage(`{"z":1,"a":"x"}`),
	})
	require.NoError(t, err)
	return row
}

func TestAppendAuditLogChainsRows(t *testing.T) {
	first := appendTestAuditEvent(t, "test.first")
	second := appendTestAuditEvent(t, "test.second")

	require.Greater(t, second.ID, first.ID)
	require.Equal(t, first.Hash, second.PrevHash)
	require.Equal(t, SealAuditLog(testAuditKey, second), second.Hash)
	// json, not jsonb: the details come back byte for byte, so the seal holds.
	require.Equal(t, `{"z":1,"a":"x"}`, string(second.Details))
}

func TestAppendAuditLogConcurrently(t *testing.T) {
	const n = 20
	var wg sync.WaitGroup
	errs := make(chan error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := testStore.AppendAuditLog(context.Background(), testAuditKey, AuditEvent{
				OccurredAt: time.Now(), RequestID: "concurrent", Action: "test.concurrent",
				Outcome: AuditOutcomeSuccess, Method: "GET", Path: "/", StatusCode: 200,
			})
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	report, err := testStore.VerifyAuditLog(context.Background(), testAuditKey)
	require.NoError(t, err)
	require.True(t, report.Valid, "chain broken at %d", report.BrokenEntryID)
	require.GreaterOrEqual(t, report.EntriesChecked, n)
}

func TestVerifyAuditLogRejectsWrongKey(t *testing.T) {
	appendTestAuditEvent(t, "test.key")

	report, err := testStore.VerifyAuditLog(context.Background(), []byte("not-the-signing-key-0123456789abcdef"))
	require.NoError(t, err)
	require.False(t, report.Valid)
	require.NotZero(t, report.BrokenEntryID)
}

func TestSealAuditLogCoversEveryField(t *testing.T) {
	row := appendTestAuditEvent(t, "test.seal")

	tampered := []func(*AuditLog){
		func(r *AuditLog) { r.ID++ },
		func(r *AuditLog) { r.OccurredAt = r.OccurredAt.Add(time.Microsecond) },
		func(r *AuditLog) { r.RequestID += "x" },
		func(r *AuditLog) { r.Actor = "someone-else" },
		func(r *AuditLog) { r.Action = "test.other" },
		func(r *AuditLog) { r.Outcome = AuditOutcomeFailure },
		func(r *AuditLog) { r.TargetType = "user" },
		func(r *AuditLog) { r.TargetID += "0" },
		func(r *AuditLog) { r.Method = "GET" },
		func(r *AuditLog) { r.Path = "/transfers" },
		func(r *AuditLog) { r.StatusCode = 500 },
		func(r *AuditLog) { r.Reason = "edited" },
		func(r *AuditLog) { r.ClientIp = "198.51.100.1" },
		func(r *AuditLog) { r.UserAgent = "curl" },
		func(r *AuditLog) { r.Details = json.RawMessage(`{"z":2,"a":"x"}`) },
		func(r *AuditLog) { r.PrevHash += "0" },
	}
	for i, tamper := range tampered {
		edited := row
		tamper(&edited)
		require.NotEqual(t, row.Hash, SealAuditLog(testAuditKey, edited), "field %d is not covered by the seal", i)
	}
}

func TestAuditLogIsAppendOnly(t *testing.T) {
	row := appendTestAuditEvent(t, "test.immutable")

	for _, stmt := range []string{
		"UPDATE audit_logs SET actor = 'someone-else' WHERE id = $1",
		"DELETE FROM audit_logs WHERE id = $1",
	} {
		_, err := testDB.Exec(stmt, row.ID)
		var pqErr *pq.Error
		require.ErrorAs(t, err, &pqErr, stmt)
		require.Equal(t, "restrict_violation", pqErr.Code.Name(), stmt)
	}

	_, err := testDB.Exec("TRUNCATE audit_logs")
	require.ErrorContains(t, err, "append-only")
}
