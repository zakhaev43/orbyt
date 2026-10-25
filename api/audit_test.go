package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"
	mockdb "github.com/zakhaev43/orbyt/db/mock"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"github.com/zakhaev43/orbyt/util"
	"go.uber.org/mock/gomock"
)

// expectAuditEvent captures the next audit event so the test can inspect it.
func expectAuditEvent(store *mockdb.MockStore) *db.AuditEvent {
	var got db.AuditEvent
	store.EXPECT().AppendAuditLog(gomock.Any(), gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ any, key []byte, event db.AuditEvent) (db.AuditLog, error) {
			got = event
			return db.AuditLog{}, nil
		})
	return &got
}

func TestAuditLogIsAdminOnly(t *testing.T) {
	ctrl := gomock.NewController(t)
	store := mockdb.NewMockStore(ctrl)
	store.EXPECT().GetUser(gomock.Any(), "alice").Return(db.User{Username: "alice", Role: "customer"}, nil).Times(2)
	store.EXPECT().ListAuditLogs(gomock.Any(), gomock.Any()).Times(0)
	store.EXPECT().VerifyAuditLog(gomock.Any(), gomock.Any()).Times(0)
	event := expectAuditEvent(store)

	server := newTestServer(t, store)
	recorder := doJSON(t, server, http.MethodGet, "/admin/audit-logs?page_size=20", nil, "alice")
	require.Equal(t, http.StatusForbidden, recorder.Code)

	// The attempt itself is on the record.
	require.Equal(t, "admin.audit.view", event.Action)
	require.Equal(t, db.AuditOutcomeDenied, event.Outcome)
	require.Equal(t, "alice", event.Actor)
	require.Equal(t, "admin access required", event.Reason)
	require.NotEmpty(t, event.RequestID)
	require.Equal(t, event.RequestID, recorder.Header().Get(requestIDHeader))

	recorder = doJSON(t, server, http.MethodGet, "/admin/audit-logs/verify", nil, "alice")
	require.Equal(t, http.StatusForbidden, recorder.Code)
}

func TestListAuditLogs(t *testing.T) {
	ctrl := gomock.NewController(t)
	store := mockdb.NewMockStore(ctrl)
	store.EXPECT().GetUser(gomock.Any(), "root").Return(db.User{Username: "root", Role: RoleAdmin}, nil).Times(2)

	rows := make([]db.AuditLog, 5)
	for i := range rows {
		rows[i] = db.AuditLog{ID: int64(90 - i), Action: "auth.login", Details: json.RawMessage(`{}`)}
	}
	store.EXPECT().ListAuditLogs(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ any, arg db.ListAuditLogsParams) ([]db.AuditLog, error) {
			require.Equal(t, sql.NullString{String: "ada", Valid: true}, arg.Actor)
			require.Equal(t, sql.NullString{String: "denied", Valid: true}, arg.Outcome)
			require.Equal(t, sql.NullInt64{Int64: 100, Valid: true}, arg.BeforeID)
			require.True(t, arg.Since.Valid)
			require.False(t, arg.Action.Valid)
			require.EqualValues(t, 5, arg.PageLimit)
			return rows, nil
		})
	event := expectAuditEvent(store)

	server := newTestServer(t, store)
	recorder := doJSON(t, server, http.MethodGet, "/admin/audit-logs?page_size=5&actor=%20ada&outcome=denied&before_id=100&since_hours=24", nil, "root")
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	var rsp listAuditLogsResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &rsp))
	require.Len(t, rsp.Items, 5)
	require.NotNil(t, rsp.NextBeforeID)
	require.EqualValues(t, 86, *rsp.NextBeforeID)

	// Reading the audit log is itself audited, including what was asked for.
	require.Equal(t, "admin.audit.view", event.Action)
	require.Equal(t, "root", event.Actor)
	require.Equal(t, db.AuditOutcomeSuccess, event.Outcome)
	require.Contains(t, string(event.Details), "outcome=denied")

	recorder = doJSON(t, server, http.MethodGet, "/admin/audit-logs?page_size=5&outcome=deleted", nil, "root")
	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestAuditFailedLogin(t *testing.T) {
	ctrl := gomock.NewController(t)
	store := mockdb.NewMockStore(ctrl)

	hashed, err := util.HashPassword("correct-horse")
	require.NoError(t, err)
	store.EXPECT().GetUser(gomock.Any(), "ada").Return(db.User{Username: "ada", HashedPassword: hashed}, nil)
	event := expectAuditEvent(store)

	server := newTestServer(t, store)
	recorder := doJSON(t, server, http.MethodPost, "/users/login", map[string]string{
		"username": "ada",
		"password": "wrong-password",
	}, "")
	require.Equal(t, http.StatusUnauthorized, recorder.Code)

	require.Equal(t, "auth.login", event.Action)
	require.Equal(t, db.AuditOutcomeDenied, event.Outcome)
	require.Equal(t, "ada", event.Actor)
	require.Equal(t, "user", event.TargetType)
	require.Equal(t, "ada", event.TargetID)
	// Credentials never reach the audit log.
	require.NotContains(t, string(event.Details), "wrong-password")
}

func TestAuditAccountStatusChange(t *testing.T) {
	ctrl := gomock.NewController(t)
	store := mockdb.NewMockStore(ctrl)
	account := randomAccount("alice", util.USD)
	frozen := account
	frozen.Status = db.AccountStatusFrozen

	store.EXPECT().GetAccount(gomock.Any(), account.ID).Return(account, nil)
	store.EXPECT().UpdateAccountStatus(gomock.Any(), gomock.Any()).Return(frozen, nil)
	event := expectAuditEvent(store)

	server := newTestServer(t, store)
	recorder := doJSON(t, server, http.MethodPost, "/accounts/"+strconv.FormatInt(account.ID, 10)+"/freeze", nil, "alice")
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())

	require.Equal(t, "account.freeze", event.Action)
	require.Equal(t, "account", event.TargetType)
	require.Equal(t, strconv.FormatInt(account.ID, 10), event.TargetID)
	require.JSONEq(t, `{"status_before":"active","status_after":"frozen"}`, string(event.Details))
}

func TestAuditCustomerReadsAreNotRecorded(t *testing.T) {
	ctrl := gomock.NewController(t)
	store := mockdb.NewMockStore(ctrl)
	account := randomAccount("alice", util.USD)
	store.EXPECT().GetAccount(gomock.Any(), account.ID).Return(account, nil).Times(2)
	store.EXPECT().AppendAuditLog(gomock.Any(), gomock.Any(), gomock.Any()).Times(1).
		DoAndReturn(func(_ any, _ []byte, event db.AuditEvent) (db.AuditLog, error) {
			require.Equal(t, actionAccessDenied, event.Action)
			require.Equal(t, "mallory", event.Actor)
			return db.AuditLog{}, nil
		})

	server := newTestServer(t, store)
	recorder := doJSON(t, server, http.MethodGet, "/accounts/"+strconv.FormatInt(account.ID, 10), nil, "alice")
	require.Equal(t, http.StatusOK, recorder.Code)

	// Someone else's account: refused, so recorded.
	recorder = doJSON(t, server, http.MethodGet, "/accounts/"+strconv.FormatInt(account.ID, 10), nil, "mallory")
	require.Equal(t, http.StatusForbidden, recorder.Code)
}
