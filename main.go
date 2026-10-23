package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
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

	store := db.NewStore(conn)
	fmt.Printf("The length of TokenSymmetricKey is: %d\n", len(config.TokenSymmetricKey))
	server, err := api.NewServer(config, store)

	if err != nil {
		log.Fatal("cant not create server\n", err)
	}
	//run migration
	runDBMigration(config.MigrationURL, config.DBSource)
	err = server.Start(config.ServerAddress)

	if err != nil {
		log.Fatal("cannot start server:", err)
	}

}

func runDBMigration(migrationURL string, dbSource string) {

	migration, err := migrate.New(migrationURL, dbSource)
	if err != nil {
		log.Fatal("could not create new migration instance:", err)
	}

	err = migration.Up()

	if err != nil && err != migrate.ErrNoChange {
		log.Fatalf("Migration failed: %v", err)
	}

	log.Println("db migrtaed successfully")

}
