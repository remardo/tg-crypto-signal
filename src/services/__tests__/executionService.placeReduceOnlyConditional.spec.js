const ExecutionService = require('../executionService');

describe('placeReduceOnlyConditionalWithRetry', () => {
  test('adjusts qty based on available USDT and stopPrice then succeeds', async () => {
    const svc = new ExecutionService();
    // mock bingx methods
    const mockPlaceOrder = jest
      .fn()
      // 1st call -> throw available amount error
      .mockImplementationOnce(() => {
        const e = new Error('BingX API Error [110424]: The order size must be less than the available amount of 100 USDT');
        throw e;
      })
      // 2nd call -> succeed
      .mockResolvedValueOnce({ orderId: 'ord_1', symbol: 'SAND-USDT' });

    const mockGetSymbolPrice = jest.fn().mockResolvedValue({ symbol: 'SAND-USDT', price: 10 });

    svc.bingx = {
      placeOrder: mockPlaceOrder,
      getSymbolPrice: mockGetSymbolPrice,
    };

    const baseOrder = {
      symbol: 'SAND-USDT',
      side: 'SELL',
      positionSide: 'LONG',
      type: 'STOP_MARKET',
      stopPrice: '10.00',
      workingType: 'MARK_PRICE',
      quantity: 15,
      reduceOnly: true,
      recvWindow: 5000,
      clientOrderId: 'sl_test'
    };

    const { result, usedQty } = await svc.placeReduceOnlyConditionalWithRetry(
      baseOrder,
      null,
      { stepSize: 0.1, pricePrecision: 2, minQty: 0.1 },
      3,
      15,
      'SL'
    );

    expect(result).toBeDefined();
    expect(result.orderId).toBe('ord_1');
    // available 100 USDT at price 10 => 10 qty, minus one step (0.1) => 9.9
    expect(usedQty).toBeCloseTo(9.9, 8);

    expect(mockPlaceOrder).toHaveBeenCalledTimes(2);
  });

  test('reraises non-available-amount errors', async () => {
    const svc = new ExecutionService();
    const mockPlaceOrder = jest.fn().mockImplementation(() => { throw new Error('Some other error'); });
    const mockGetSymbolPrice = jest.fn();
    svc.bingx = { placeOrder: mockPlaceOrder, getSymbolPrice: mockGetSymbolPrice };

    const baseOrder = {
      symbol: 'SAND-USDT', side: 'SELL', type: 'STOP_MARKET', stopPrice: '10.00', quantity: 5, reduceOnly: true
    };

    await expect(svc.placeReduceOnlyConditionalWithRetry(
      baseOrder,
      null,
      { stepSize: 0.1, pricePrecision: 2, minQty: 0.1 },
      2,
      5,
      'SL'
    )).rejects.toThrow('Some other error');
  });
});
