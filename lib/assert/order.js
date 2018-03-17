'use strict'

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
   * @param {Order} o
   * @param {Dataset} dataset
   * @param {number} feeMultiplier
   * @return {boolean} ok - true if there is a matching balance update
   */
  assertWalletsUpdated (o, dataset, feeMultiplier) {
    const wu = dataset.getWalletUpdates()
    const wType = o.type.indexOf('EXCHANGE') !== -1 ? 'exchange' : 'margin'
    const amount = +o.amountOrig
    const price = +(o.priceAvg || (o.isOCO() ? o.priceAuxLimit : o.price))

    // Resolve base/quote wallets
    const qCurrency = o.getQuoteCurrency()
    const bCurrency = o.getBaseCurrency()
    const fCurrency = amount < 0 ? qCurrency : bCurrency
    const qwid = getWalletKey({ type: wType, currency: qCurrency })
    const bwid = getWalletKey({ type: wType, currency: bCurrency })
    const fwid = getWalletKey({ type: wType, currency: fCurrency })
    const qw = dataset.getWalletSnapshot(qwid)
    const bw = dataset.getWalletSnapshot(bwid)
    const fw = dataset.getWalletSnapshot(fwid)
    const onv = Math.abs(price * amount)
    const feeAmount = Math.abs(amount > 0 ? amount : onv)

    if (!bw) throw new Error(`missing wallet snapshot for ${bwid}`)
    if (!qw) throw new Error(`missing wallet snapshot for ${qwid}`)
    if (!fw) throw new Error(`missing wallet snapshot for ${fwid}`)

    debugV(
      'assert wallets updated: %s %f @ %f type %s (%s)',
      o.symbol, amount, price, o.type, o.status
    )

    debugV('qw.balance: %f [%s]', qw.balance, qwid)
    debugV('bw.balance: %f [%s]', bw.balance, bwid)
    debugV('fw.balance: %f [%s]', fw.balance, fwid)
    debugV('onv: %f [%s]', onv, qCurrency)

    let orderBChange = 0
    let orderQChange = 0
    let feeQChange = 0
    let feeBChange = 0

    if (amount > 0) {
      debugV('expect %s: +%f', bCurrency, amount)
      debugV('expect %s: -%f', qCurrency, onv)
      debugV('expect fee %s: -%f', fCurrency, feeAmount * feeMultiplier)

      orderBChange = amount
      orderQChange = -onv
    } else {
      debugV('expect %s: %f', bCurrency, amount)
      debugV('expect %s: +%f', qCurrency, onv)
      debugV('expect fee %s: -%f', fCurrency, feeAmount * feeMultiplier)

      orderBChange = amount
      orderQChange = onv
    }

    if (fCurrency === qCurrency) {
      feeQChange = feeAmount * (-feeMultiplier)
    } else {
      feeBChange = feeAmount * (-feeMultiplier)
    }

    let uDelta
    let walletsOK = 0 // +1 for each, 1 fee & order calc on each base/quote

    const qWU = wu.filter(u => u.type === wType && u.currency === qCurrency)
    const bWU = wu.filter(u => u.type === wType && u.currency === bCurrency)

    qWU.unshift(qw)
    bWU.unshift(bw)

    if (feeQChange === 0) walletsOK++ // skip quote fee check

    // Here be dragons
    for (let i = 0; i < qWU.length - 1; i += 1) {
      if (walletsOK >= 2) break

      uDelta = qWU[i + 1].balance - qWU[i].balance

      if (
        (Math.abs(uDelta - orderQChange) < DUST[qCurrency])
      ) {
        walletsOK++
      }

      if (feeQChange !== 0) {
        if (
          (Math.abs(feeQChange) < DUST[qCurrency]) ||
          (Math.abs(uDelta - feeQChange) < DUST[qCurrency])
        ) {
          walletsOK++
        }
      }
    }

    if (feeBChange === 0) walletsOK++ // skip base fee check

    for (let i = 0; i < bWU.length - 1; i += 1) {
      if (walletsOK >= 4) break

      uDelta = bWU[i + 1].balance - bWU[i].balance

      if (
        (Math.abs(uDelta - orderBChange) < DUST[bCurrency])
      ) {
        walletsOK++
      }

      if (feeBChange !== 0) {
        if (
          (Math.abs(feeBChange) < DUST[bCurrency]) ||
          (Math.abs(uDelta - feeBChange) < DUST[bCurrency])
         ) {
          walletsOK++
        }
      }
    }

    if (walletsOK < 4) {
      debug('local ws: %s balance %f', bwid, bw.balance)
      debug('local ws: %s balance %f', qwid, qw.balance)

      wu.filter(u => u.type === wType).forEach(u =>
        debug('local wu: %s balance %f', getWalletKey(u), u.balance)
      )

      throw new Error('wu packets not found for order') // info log'ed above
    }
  }
}
