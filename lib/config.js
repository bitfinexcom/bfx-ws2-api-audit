'use strict'

const M_FEE = 0.001
const T_FEE = 0.002

module.exports = {
  M_FEE,
  T_FEE,
  M_FEE_M: 1 - M_FEE,
  T_FEE_M: 1 - T_FEE,
  DUST: { // TODO: revise, min deltas for balance equality
    BTC: 0.0000001,
    IOT: 0.0000001,
    ETH: 0.0000001,
    USD: 0.0000001,
    JPY: 0.0000001,
    BAT: 0.0000001,
    ETP: 0.0000001,
    AVT: 0.0000001,
    QTM: 0.0000001
  }
}
