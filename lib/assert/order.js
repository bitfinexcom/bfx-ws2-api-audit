'use strict'

const _sum = require('lodash/sum')
const debug = require('debug')('bfx-ws2-api-audit:assert:order')
const debugV = require('debug')('bfx-ws2-api-audit:assert:order:verbose')
const { getWalletKey } = require('../dataset.utils')
const { DUST } = require('../config')

module.exports = {
  assertCanceled (o = {}) {
    const { status } = o
    if (status.indexOf('CANCELED') !== -1) return
    throw new Error(`order not canceled: ${status}`)
  },

  assertNotCanceled (o = {}) {
    const { status } = o
    if (status.indexOf('CANCELED') === -1) return
    throw new Error(`order canceled: ${status}`)
  },

  assertNotFilled (o) {
    debug('assert not filled (a: %f, aO: %f)', o.amount, o.amountOrig)
    if (o.amount === o.amountOrig) return
    throw new Error('order partially or fully filled: ' + o.serialize())
  },

  assertPartiallyFilled (o) {
    debug('assert partially filled (a: %f, aO: %f)', o.amount, o.amountOrig)
    if (o.amount !== 0 && o.amount < o.amountOrig) return
    throw new Error('order not partially filled: ' + o.serialize())
  },

  assertFullyFilled (o) {
    debug('assert fully filled (a: %f, aO: %f)', o.amount, o.amountOrig)
    if (o.amount === 0) return
    throw new Error('order not fully filled: ' + o.serialize())
  },

  /**
   * Scans received wallet update packets, and verifies that the order and
   * associated fees have been applied
   *
   * @param {Order} o - required
   * @param {Dataset} dataset
   * @param {number} feeMultiplier
   * @return {boolean} ok - true if there is a matching balance update
   */
  assertWalletsUpdated (o, dataset, feeMultiplier) {
    const wType = o.type.indexOf('EXCHANGE') !== -1 ? 'exchange' : 'margin'
    const qCurrency = o.getQuoteCurrency()
    const bCurrency = o.getBaseCurrency()
    const amount = +o.amountOrig
    const fCurrency = amount < 0 ? qCurrency : bCurrency
    const price = +(o.priceAvg || (o.isOCO() ? o.priceAuxLimit : o.price))
    const onv = Math.abs(price * amount)
    const feeAmount = Math.abs(amount > 0 ? amount : onv)

    const qWalletKey = getWalletKey({ type: wType, currency: qCurrency })
    const bWalletKey = getWalletKey({ type: wType, currency: bCurrency })
    const fWalletKey = getWalletKey({ type: wType, currency: fCurrency })

    const qWalletUpdates = dataset.getWalletUpdates(qWalletKey)
    const bWalletUpdates = dataset.getWalletUpdates(bWalletKey)
    const fWalletUpdates = dataset.getWalletUpdates(fWalletKey)

    // Resolve base/quote wallets
    const qw = dataset.getWalletSnapshot(qWalletKey)
    const bw = dataset.getWalletSnapshot(bWalletKey)
    const fw = dataset.getWalletSnapshot(fWalletKey)

    if (!bw) throw new Error(`missing wallet snapshot for ${bWalletKey}`)
    if (!qw) throw new Error(`missing wallet snapshot for ${qWalletKey}`)
    if (!fw) throw new Error(`missing wallet snapshot for ${fWalletKey}`)

    debugV(
      'assert wallets updated: %s %f @ %f type %s (%s)',
      o.symbol, amount, price, o.type, o.status
    )

    const qDust = DUST[qCurrency]
    const bDust = DUST[bCurrency]
    const fDust = DUST[fCurrency]

    let orderBChange = 0
    let orderQChange = 0
    let feeQChange = 0
    let feeBChange = 0

    if (amount > 0) {
      orderBChange = amount
      orderQChange = -onv
    } else {
      orderBChange = amount
      orderQChange = onv
    }

    if (fCurrency === qCurrency) {
      feeQChange = feeAmount * (-feeMultiplier)
    } else {
      feeBChange = feeAmount * (-feeMultiplier)
    }

    debugV('quote wallet balance: %f [%s]', qw.balance, qWalletKey)
    debugV('base wallet balance: %f [%s]', bw.balance, bWalletKey)
    debugV('fee wallet balance: %f [%s]', fw.balance, fWalletKey)

    if (feeQChange !== 0) debugV('quote fee change: %f', feeQChange)
    if (orderQChange !== 0) debugV('quote order change: %f', orderQChange)
    if (feeBChange !== 0) debugV('base fee change: %f', feeBChange)
    if (orderBChange !== 0) debugV('base order change: %f', orderBChange)

    let wu
    const found = {
      qOrder: null,
      bOrder: null,
      qFee: feeQChange === 0 ? 'none' : null, // only if there is a fee
      bFee: feeBChange === 0 ? 'none' : null
    }

    for (let i = 0; i < qWalletUpdates.length; i += 1) {
      if (found.qOrder !== null && found.qFee !== null) break

      wu = qWalletUpdates[i]

      if ((found.qOrder === null) && (Math.abs(wu.delta - orderQChange) < qDust)) {
        debugV('found quote order wu: %s [delta %f]', JSON.stringify(wu), wu.delta)
        found.qOrder = wu
        continue
      }

      if ((found.qFee === null) && (Math.abs(wu.delta - feeQChange) < qDust)) {
        debugV('found quote fee wu: %s [delta %f]', JSON.stringify(wu), wu.delta)
        found.qFee = wu
        continue
      }
    }

    for (let i = 0; i < bWalletUpdates.length; i += 1) {
      if (found.bOrder !== null && found.bFee !== null) break

      wu = bWalletUpdates[i]

      if ((found.bOrder === null) && (Math.abs(wu.delta - orderBChange) < bDust)) {
        debugV('found base order wu: %s [delta %f]', JSON.stringify(wu), wu.delta)
        found.bOrder = wu
        continue
      }

      if ((found.bFee === null) && (Math.abs(wu.delta - feeBChange) < bDust)) {
        debugV('found base fee wu: %s [delta %f]', JSON.stringify(wu), wu.delta)
        found.bFee = wu
        continue
      }
    }

    if (Object.values(found).filter(v => v !== null).length !== 4) {
      throw new Error('matching wallet updates not found for order')
    }
  }
}
