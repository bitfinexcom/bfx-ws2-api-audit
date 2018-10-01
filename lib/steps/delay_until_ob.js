'use strict'

const _isString = require('lodash/isString')

/**
 * @param {Object} args
 * @param {string} args.symbolT - taker symbol for order book
 * @param {string} args.symbolM - maker symbol for order book
 * @return {Object} step
 */
module.exports = ({ symbolT, symbolM } = {}) => {
  const targets = []

  if (_isString(symbolT)) targets.push('taker')
  if (_isString(symbolM)) targets.push('maker')

  return {
    id: 'cancel_all',
    label: 'Delaying until arrival of initial OB...',
    actors: targets,
    exec: ({ dataM, dataT }) => {
      const promises = []

      if (_isString(symbolM)) {
        promises.push(dataM.delayUntilOrderBook(symbolM))
      }

      if (_isString(symbolT)) {
        promises.push(dataT.delayUntilOrderBook(symbolT))
      }

      return Promise.all(promises)
    }
  }
}
