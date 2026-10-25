package api

import (
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	mockdb "github.com/zakhaev43/orbyt/db/mock"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"github.com/zakhaev43/orbyt/util"
	"go.uber.org/mock/gomock"
)

func newTestServer(t *testing.T, store db.Store) *Server {
	config := util.Config{
		TokenSymmetricKey:   util.RandomString(32),
		AccessTokenDuration: time.Minute,
		AuditSigningKey:     util.RandomString(32),
	}

	// Most tests don't care about audit events. Expectations set before this
	// one are matched first, so a test can still assert on specific events.
	if mock, ok := store.(*mockdb.MockStore); ok {
		mock.EXPECT().AppendAuditLog(gomock.Any(), gomock.Any(), gomock.Any()).AnyTimes()
	}

	server, err := NewServer(config, store)
	require.NoError(t, err)

	return server
}

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)

	os.Exit(m.Run())
}
