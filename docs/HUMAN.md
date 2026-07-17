I want to build ai-based stocks analyser.

Key ideas:
- It's not just a text, I don't want it to be MCP and claude just giving text back
- I want each question to lead to interactive dashboard or widget
- I want to use clickhouse to store data 
- 
- I want to have following pre-defined views
	- individual stock
	- group of stocks
	
Group of stocks can be arbitary ,or stocks by category or maybe by index , whatever

Each stock by default would show:
- Company name, ticket, category
- Stock overview like in references/single-stock-overview.png
- Graph, default to price but toggler to switch to PE/market cap, EPS, any other useful stats
- Some easy to udnerstand visual for  stock Fundamentals Summary
- Earnings & Revenue section (vs industry)
- Price to Earnings Ratio (vs industry or competitro)

____

Now interesting part I also want to have a view for group of stocks 
That view should have different versions:
- heatmap view (in case I want a price overview) see references/heatmap.png
- I want tile-based comparison (if less then 10) with horizontal scroll
- I want table-based view if more then 10 but not heatmap
