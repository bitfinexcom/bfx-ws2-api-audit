'use strict'

const { Order } = require('bitfinex-api-node/lib/models')
const { M_FEE, T_FEE } = require('../../config')
const genOrderUtils = require('../../util/gen_order')
const delayPromise = require('../../util/delay_promise')
const {
  assertNotFilled, assertFullyFilled, assertWalletsUpdated
} = require('../../assert/order')

const {
  assertOrderInserted, assertOrderRemoved
} = require('../../assert/orderbook')

const stepCancelAllOrders = require('../../steps/cancel_all_orders')
const stepRefreshSnapshots = require('../../steps/refresh_data_snapshots')

/**
 * Submit a LIMIT order and verify it is added to the order book & executed by
 * a matching MARKET order, in both directions.
 *
 * @param {Object} args
 * @param {string} args.symbol
 * @param {number} args.amount
 * @param {number} args.initialMid - used as the LIMIT price if the OB is empty
 * @param {number?} args.dataDelay - ms to wait after submit before continuing
 * @param {string} args.primaryPair - 'main' order book, i.e. BTC/USD
 * @param {string} args.virtualPair - 'virtual' order book, i.e. BTC/JPY
 * @return {Object} step
 */
module.exports = ({
  symbol, amount, initialMid, dataDelay, primaryPair, virtualPair
}) => {
  if (!primaryPair) throw new Error('primary OB pair required')
  if (!virtualPair) throw new Error('virtual OB pair required')

  const poUtils = genOrderUtils(primaryPair, amount, dataDelay)
  const voUtils = genOrderUtils(virtualPair, amount, dataDelay)

  return {
    id: 'virtual_obs_limit_replication',
    label: 'submit a LIMIT order into one OB, and verify replication on linked OB',
    actors: ['maker', 'taker'],
    before: [
      stepCancelAllOrders(),
      stepRefreshSnapshots()
    ],
    exec: ({ dataM, dataT, restM, wsM, wsT, refreshSnapshots }) => {
      const _mp = dataM.midPrice(primaryPair) // note pair
      const pMidPrice = _mp === 0 ? initialMid : _mp

      // TODO: Verify mid price is clean & doesn't overlap

      // Get exchange rate between pairs
      const primaryQuote = primaryPair.substring(primaryPair.length - 3)
      const virtualQuote = virtualPair.substring(virtualPair.length - 3)

      // Initial maker LIMIT orders on primary OB
      const oSellM = poUtils.genLimitSell({ price: pMidPrice * 1.002 })
      const oBuyM = poUtils.genLimitBuy({ price: pMidPrice * 1.001 })

      // MARKET taker orders on virtual pair
      const voSellT = voUtils.genMarketSell()
      const voBuyT = voUtils.genMarketBuy()

      // get fx rate
      return restM.exchangeRate(primaryQuote, virtualQuote).then(rate => {
        const voSellM = poUtils.cloneToVirtual(oSellM, rate, virtualPair)
        const voBuyM = poUtils.cloneToVirtual(oBuyM, rate, virtualPair)

        // submit primary maker LIMIT orders
        return poUtils.submitOrder(oSellM, wsM, dataM).then(() => {
          return poUtils.submitOrder(oBuyM, wsM, dataM)
        }).then(() => {
          dataM.updateOrder(oSellM)

          assertOrderInserted(oBuyM, dataM)
          assertOrderInserted(oSellM, dataM)
          assertOrderInserted(voBuyM, dataM, true)  // virtual orders
          assertOrderInserted(voSellM, dataM, true) //
          refreshSnapshots()
        
          // submit virtual taker MARKET orders
          return voUtils.submitOrder(voBuyT, wsT, dataT).then(() => {
            return voUtils.submitOrder(voSellT, wsT, dataT)
          })
        }).then(() => {
          dataT.updateOrder(voBuyT)
          dataM.updateOrder(oBuyM)
          dataM.updateOrder(oSellM)

          assertFullyFilled(voBuyT) // taker orders
          assertFullyFilled(voSellT)
          assertWalletsUpdated(voBuyT, dataT, T_FEE * 0.7)
          assertWalletsUpdated(voSellT, dataT, T_FEE * 0.7)

          assertOrderRemoved(oBuyM, dataM)
          assertOrderRemoved(oSellM, dataM)
          assertOrderRemoved(voBuyM, dataM, true)
          assertOrderRemoved(voSellM, dataM, true)
          assertWalletsUpdated(oBuyM, dataM, M_FEE)
          assertWalletsUpdated(oSellM, dataM, M_FEE)
        })
      })
    }
  }
}
