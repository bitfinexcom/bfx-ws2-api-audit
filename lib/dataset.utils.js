'use strict'

const getWalletKey = (w = {}) => {
  return `${w.type}-${w.currency}`
}

module.exports = { getWalletKey }
