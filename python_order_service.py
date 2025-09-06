#!/usr/bin/env python3
"""
Python BingX Order Service
More reliable order management using python-bingx library
"""

import sys
import json
import logging
from typing import Dict, Any, Optional
from bingx_api import BingXAPI

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PythonBingXOrderService:
    def __init__(self, api_key: str, secret_key: str):
        self.api_key = api_key
        self.secret_key = secret_key
        self.client = BingXAPI(api_key=api_key, secret_key=secret_key)
        logger.info("Python BingX Order Service initialized")

    def place_order(self, order_data: Dict[str, Any], sub_account_id: Optional[str] = None) -> Dict[str, Any]:
        """Place an order using python-bingx library"""
        try:
            # Prepare order parameters
            params = {
                'symbol': order_data['symbol'],
                'side': order_data['side'],
                'type': order_data['type'],
                'quantity': str(order_data['quantity'])
            }

            # Add optional parameters
            if 'price' in order_data and order_data['price']:
                params['price'] = str(order_data['price'])

            if 'stopPrice' in order_data and order_data['stopPrice']:
                params['stopPrice'] = str(order_data['stopPrice'])

            if 'positionSide' in order_data and order_data['positionSide']:
                params['positionSide'] = order_data['positionSide']

            if 'workingType' in order_data and order_data['workingType']:
                params['workingType'] = order_data['workingType']

            if 'clientOrderId' in order_data and order_data['clientOrderId']:
                params['newClientOrderId'] = order_data['clientOrderId']

            # Handle reduceOnly based on position mode
            if 'reduceOnly' in order_data and order_data['reduceOnly'] is not None:
                # Check position mode
                position_mode = self._get_position_mode(sub_account_id)
                if position_mode != 'hedge':
                    params['reduceOnly'] = str(order_data['reduceOnly']).lower()

            logger.info(f"Placing order: {params}")

            # Place the order
            result = self.client.perpetual_swap_trade.order(**params)

            if result and 'orderId' in result:
                logger.info(f"Order placed successfully: {result['orderId']}")
                return {
                    'success': True,
                    'orderId': result['orderId'],
                    'clientOrderId': result.get('clientOrderId'),
                    'status': result.get('status', 'NEW'),
                    'symbol': result.get('symbol'),
                    'side': result.get('side'),
                    'positionSide': result.get('positionSide')
                }
            else:
                logger.error(f"Order placement failed: {result}")
                return {
                    'success': False,
                    'error': 'Order placement failed',
                    'details': result
                }

        except Exception as e:
            logger.error(f"Error placing order: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def _get_position_mode(self, sub_account_id: Optional[str] = None) -> str:
        """Get position mode (hedge or one-way)"""
        try:
            # This would need to be implemented based on BingX API
            # For now, return 'one-way' as default
            return 'one-way'
        except Exception as e:
            logger.warning(f"Could not determine position mode: {str(e)}")
            return 'one-way'

    def cancel_order(self, order_id: str, symbol: str, sub_account_id: Optional[str] = None) -> Dict[str, Any]:
        """Cancel an order"""
        try:
            result = self.client.perpetual_swap_trade.cancel_order(
                symbol=symbol,
                orderId=order_id
            )

            if result and 'orderId' in result:
                logger.info(f"Order cancelled: {order_id}")
                return {
                    'success': True,
                    'orderId': result['orderId'],
                    'status': result.get('status')
                }
            else:
                return {
                    'success': False,
                    'error': 'Cancel failed',
                    'details': result
                }

        except Exception as e:
            logger.error(f"Error cancelling order: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

def main():
    """Main function for command line usage"""
    if len(sys.argv) < 2:
        print("Usage: python python_order_service.py <command> <args>")
        sys.exit(1)

    command = sys.argv[1]

    # Load configuration from environment or config file
    # For now, using placeholder values
    api_key = "your_api_key"
    secret_key = "your_secret_key"

    service = PythonBingXOrderService(api_key, secret_key)

    if command == 'place_order':
        if len(sys.argv) < 3:
            print("Usage: python python_order_service.py place_order <order_json>")
            sys.exit(1)

        order_data = json.loads(sys.argv[2])
        result = service.place_order(order_data)
        print(json.dumps(result))

    elif command == 'cancel_order':
        if len(sys.argv) < 4:
            print("Usage: python python_order_service.py cancel_order <order_id> <symbol>")
            sys.exit(1)

        order_id = sys.argv[2]
        symbol = sys.argv[3]
        result = service.cancel_order(order_id, symbol)
        print(json.dumps(result))

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

if __name__ == '__main__':
    main()
