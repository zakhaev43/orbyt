package main

import (
	"database/sql"
	"log"
	"time"

	_ "github.com/lib/pq"

	"github.com/zakhaev43/orbyt/api"
	db "github.com/zakhaev43/orbyt/db/sqlc"
	"github.com/zakhaev43/orbyt/util"
)

func main() {
	config, err := util.LoadConfig(".")
	if err != nil {
		log.Fatal("cannot load config file:", err)
	}

	conn, err := sql.Open(config.DBDriver, config.DBSource)
	if err != nil {
		log.Fatal("cannot connect to db:", err)
	}
	if err := db.WaitForDB(conn, 30*time.Second); err != nil {
		log.Fatal("database not reachable:", err)
	}
	if err := db.RunMigrations(config.MigrationURL, config.DBSource); err != nil {
		log.Fatal("migration failed:", err)
	}
	log.Println("db migrated successfully")

	server, err := api.NewServer(config, db.NewStore(conn))
	if err != nil {
		log.Fatal("cannot create server:", err)
	}

	if err := server.Start(config.ServerAddress); err != nil {
		log.Fatal("cannot start server:", err)
	}
}
