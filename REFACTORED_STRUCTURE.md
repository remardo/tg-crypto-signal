# Refactored Project Structure

## Core Application Files (Essential)
- src/ - Main source code
  - config/ - Configuration files
  - database/ - Database migrations and connection
  - middleware/ - Express middleware
  - models/ - Data models
  - routes/ - API routes
  - services/ - Business logic services
  - utils/ - Utility functions
  - websocket/ - WebSocket handlers
  - server.js - Main application entry point
- public/ - Static frontend files
- package.json - Project dependencies and scripts
- .env.example - Environment variable template
- .gitignore - Git ignore rules
- README.md - Project documentation

## Files to Remove (Development/Testing Only)
These files are useful for development and testing but not needed for production deployment:

### Debug and Analysis Scripts
- analyze_latest_signal.js
- analyze_signal_directions.js
- check_accounts.js
- check_latest_position.js
- check_orders.js
- check_recent_activity.js
- check_signal_execution.js
- check_sui_price.js
- check_useless_signal.js
- check_useless_signal_raw.js
- check_useless_state.js
- cleanup_stale_positions.js
- create_real_signal.js
- debug_balance.js
- debug_position_size.js
- debug_take_profit_issue.js
- disable_risk_management.js
- inspect_bingx_response.js

### Test Scripts
- automated_order_tests.js
- execute_bingx_test.js
- execute_real_trade.js
- execute_uni_signal.js
- fix_account.js
- test_basic_limit_order.js
- test_bingx.js
- test_bingx_api.js
- test_btc_trade.js
- test_corrected_tp_logic.js
- test_different_tp_params.js
- test_direct_bingx_order.js
- test_direct_trading.js
- test_enhanced_order.js
- test_execution.js
- test_improved_tp.js
- test_new_position_calc.js
- test_no_risk.js
- test_order_execution.js
- test_signal_enhanced.js
- test_signal_execution.js
- test_simple_reduce_only.js
- test_simple_signal.js
- test_sui_symbol.js
- test_tp_arrangement.js
- test_tp_fix.js
- validate_tp_fix.js

### Test Data Files
- test_channel.json
- test_signal.json
- test_signal_data.json

### Other Non-Essential Files
- frontend/ - Appears to be an empty directory
- docs/ - Empty directory
- logs/ - Log files (should be in .gitignore)
- node_modules/ - Dependencies (reinstalled via npm install)
- .qoder/ - IDE specific files
- setup_postgres_password.bat - Environment specific script
- settings.json - Possibly temporary configuration