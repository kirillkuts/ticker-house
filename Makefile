.PHONY: up down restart logs ps sql sh wipe

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f clickhouse

ps:
	docker compose ps

# interactive SQL shell into ticker_house
sql:
	docker exec -it ticker-house-clickhouse clickhouse-client -u ticker --password ticker -d ticker_house

# bash shell inside the container
sh:
	docker exec -it ticker-house-clickhouse bash

# stop and delete all data on disk
wipe:
	docker compose down
	rm -rf .clickhouse
