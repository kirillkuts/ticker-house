.PHONY: up down restart logs ps sql sh wipe mcp chat-up chat-down chat-logs

# ClickHouse MCP server for LibreChat (HTTP transport on :8001)
mcp:
	CLICKHOUSE_HOST=localhost CLICKHOUSE_PORT=8123 \
	CLICKHOUSE_USER=ticker CLICKHOUSE_PASSWORD=ticker \
	CLICKHOUSE_DATABASE=ticker_house CLICKHOUSE_SECURE=false \
	CLICKHOUSE_MCP_SERVER_TRANSPORT=http CLICKHOUSE_MCP_BIND_HOST=0.0.0.0 \
	CLICKHOUSE_MCP_BIND_PORT=8001 CLICKHOUSE_MCP_AUTH_DISABLED=true \
	uvx mcp-clickhouse

chat-up:
	docker compose -f docker-compose.chat.yml --env-file .env up -d

chat-down:
	docker compose -f docker-compose.chat.yml down

chat-logs:
	docker compose -f docker-compose.chat.yml logs -f librechat

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
