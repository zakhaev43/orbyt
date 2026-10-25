package api

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"github.com/zakhaev43/orbyt/token"
	"github.com/zakhaev43/orbyt/util"
)

type Server struct {
	store      db.Store
	router     *gin.Engine
	tokenMaker token.Maker
	config     util.Config
}

func NewServer(config util.Config, store db.Store) (*Server, error) {

	tokenMaker, err := token.NewPasetoMaker(config.TokenSymmetricKey)
	fmt.Printf("The length of TokenSymmetricKey is: %d\n", len(config.TokenSymmetricKey))

	if err != nil {
		return nil, fmt.Errorf("cant create token matter\n%w", err)
	}

	server := &Server{
		store:      store,
		tokenMaker: tokenMaker,
		config:     config,
	}

	if v, ok := binding.Validator.Engine().(*validator.Validate); ok {

		v.RegisterValidation("currency", validCurrency)
	}

	server.setUpRouter()

	return server, nil
}

func (server *Server) setUpRouter() {
	router := gin.Default()
	router.Use(corsMiddleware(server.config.AllowedOrigin))
	authRoutes := router.Group("/").Use(authMiddleware(server.tokenMaker))
	authRoutes.POST("/accounts", server.createAccount)
	authRoutes.GET("/accounts/:id", server.getAccount)
	authRoutes.GET("/accounts", server.listAccount)
	authRoutes.GET("/accounts/:id/statement", server.getAccountStatement)
	authRoutes.POST("/accounts/:id/deposits", server.createDeposit)
	authRoutes.POST("/accounts/:id/freeze", server.freezeAccount)
	authRoutes.POST("/accounts/:id/unfreeze", server.unfreezeAccount)
	authRoutes.POST("/accounts/:id/close", server.closeAccount)
	authRoutes.GET("/payees/:id", server.getPayee)
	authRoutes.POST("/transfers", server.createTransfer)
	authRoutes.GET("/transfers", server.listTransfers)
	authRoutes.GET("/ledger/verify", server.verifyLedger)
	authRoutes.GET("/users/me", server.getCurrentUser)

	adminRoutes := router.Group("/admin").Use(authMiddleware(server.tokenMaker), server.adminMiddleware())
	adminRoutes.GET("/stats", server.adminStats)
	adminRoutes.GET("/activity", server.adminActivity)
	adminRoutes.GET("/transactions", server.adminTransactions)
	adminRoutes.GET("/users", server.adminUsers)

	//They dont require auth middleware
	router.POST("/users", server.createUser)
	router.POST("/users/login", server.loginUser)
	router.POST("/tokens/renew_access", server.renewAccessToken)
	// Health check route (public, no auth required)
	router.GET("/health", server.HealthCheck)

	server.router = router

}

func (server *Server) HealthCheck(ctx *gin.Context) {
	ctx.JSON(200, gin.H{
		"status": "healthy",
	})
}

func (server *Server) Start(address string) error {

	return server.router.Run(address)

}

func errorResponse(err error) gin.H {

	return gin.H{"error": err.Error()}
}
