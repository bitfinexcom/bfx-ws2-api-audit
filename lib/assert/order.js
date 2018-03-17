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

    let bBalance = bw.balance
    let qBalance = qw.balance

    if (amount > 0) {
      debugV('expect %s: +%f', bCurrency, amount)
      debugV('expect %s: -%f', qCurrency, onv)
      debugV('expect fee %s: -%f', fCurrency, feeAmount * feeMultiplier)

      bBalance += amount
      qBalance -= onv
    } else {
      debugV('expect %s: %f', bCurrency, amount)
      debugV('expect %s: +%f', qCurrency, onv)
      debugV('expect fee %s: -%f', fCurrency, feeAmount * feeMultiplier)

      bBalance += amount
      qBalance += onv
    }

    if (fCurrency === qCurrency) {
      qBalance -= feeAmount * feeMultiplier
    } else {
      bBalance -= feeAmount * feeMultiplier
    }

    let u
    let walletsOK = 0 // +1 for each

    for (let i = 0; i < wu.length; i += 1) {
      if (walletsOK === 2) break

      u = wu[i]
      if (u.type !== wType) continue

      if (u.currency === qCurrency) {
        console.log(`${qCurrency} ${Math.abs(+u.balance - qBalance)} < ${DUST[qCurrency]}`)
        if (Math.abs(+u.balance - qBalance) < DUST[qCurrency]) {
          console.log('ok')
          walletsOK++
          continue
        }
      } else if (u.currency === bCurrency) {
        console.log(`${bCurrency} ${Math.abs(+u.balance - bBalance)} < ${DUST[bCurrency]}`)
        if (Math.abs(+u.balance - bBalance) < DUST[bCurrency]) {
          console.log('ok')
          walletsOK++
          continue
        }
      }
    }
    
    if (walletsOK !== 2) {
      throw new Error('wu packet not found for order') // info log'ed above
    }
  }
}
