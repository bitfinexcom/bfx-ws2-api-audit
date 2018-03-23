'use strict'

const M_FEE = 0.001
const T_FEE = 0.002

module.exports = {
  M_FEE,
  T_FEE,
  M_FEE_M: 1 - M_FEE,
  T_FEE_M: 1 - T_FEE,
  DUST: { // TODO: revise, min deltas for balance equality
    BTC: 0.005,
    IOT: 0.01,
    ETH: 0.0001,
    USD: 0.0005,
    JPY: 0.0001,
    BAT: 0.0000001,
    ETP: 0.0000001,
    AVT: 0.0000001,
    QTUM: 0.0000001
  }
}
