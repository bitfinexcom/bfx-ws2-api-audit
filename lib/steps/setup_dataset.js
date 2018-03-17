'use strict'

module.exports = () => ({
  id: 'setup_datset',
  label: 'registers dataset listeners & subscribes to channels',
  actors: ['maker', 'taker'],
  exec: ({ dataT, dataM }) => {
    dataT.registerListeners()
    dataT.subscribeChannels()
    dataM.registerListeners()
    dataM.subscribeChannels()

    return Promise.resolve()
  }
})
