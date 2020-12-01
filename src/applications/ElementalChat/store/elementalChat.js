function pollMessages(dispatch, channel, date) {
  dispatch("listMessages", {
    channel: channel,
    date: date
  });
}

function logItToConsole(what, time) { // eslint-disable-line
  console.log(time, what);
}

const doReset = async dispatch => {
  //dispatch("resetElementalChat");
  return dispatch("resetState", null, { root: true });
};

const callZome = async (dispatch, rootState, zome_name, fn_name, payload) => {
  if (rootState.conductorDisconnected) {
    return;
  }
  try {
    const result = await rootState.holochainClient.callZome({
      cap: null,
      cell_id: rootState.appInterface.cellId,
      zome_name,
      fn_name,
      provenance: rootState.agentKey,
      payload
    });
    return result;
  } catch (error) {
    console.log("callZome threw error: ", error);
    return doReset(dispatch);
  }
};

let intervalId = 0;

export default {
  namespaced: true,
  state: {
    channels: [],
    channel: {
      info: { name: "" },
      channel: { category: "General", uuid: "" },
      messages: []
    },
    error: {
      shouldShow: false,
      message: ""
    }
  },
  actions: {
    updateHandle: async ({ rootState }) => {
      logItToConsole("updateHandle start", Date.now());
      rootState.needsHandle = true;
    },
    setChannel: async ({ commit, rootState, dispatch }, payload) => {
      logItToConsole("setChannel start", Date.now());
      console.log(payload.channel);
      rootState.hcDb.elementalChat
        .get(payload.channel.uuid)
        .then(channel => {
          logItToConsole("setChannel dexie done", Date.now());
          if (channel === undefined) channel = payload;
          commit("setChannel", channel);
          pollMessages(dispatch, payload, rootState.today);
          clearInterval(intervalId);
          intervalId = setInterval(function() {
            pollMessages(dispatch, payload, rootState.today);
          }, 50000);
        })
        .catch(error => logItToConsole(error));
    },
    addSignalChannel: async (
      { commit, state, rootState, dispatch },
      payload
    ) => {
      const committedChannel = payload;
      // don't add channel if already exists
      const channelExists = !!state.channels.find(
        channel => channel.channel.uuid === committedChannel.channel.uuid
      );
      if (channelExists) return;

      // currently this follows the same logic as if we had created our own channel...
      // todo: distinguish between committed and received channels
      logItToConsole("new channel signal received", Date.now());
      console.log("received channel : ", committedChannel);
      committedChannel.last_seen = { First: null };
      commit("createChannel", { ...committedChannel, messages: [] });
      rootState.hcDb.elementalChat
        .put(
          { ...committedChannel, messages: [] },
          committedChannel.channel.uuid
        )
        .then(logItToConsole("createChannel dexie done", Date.now()))
        .catch(error => logItToConsole(error));
      dispatch("setChannel", { ...committedChannel, messages: [] });
    },
    createChannel: async ({ commit, rootState, dispatch }, payload) => {
      logItToConsole("createChannel start", Date.now());
      const holochainPayload = {
        name: payload.info.name,
        channel: payload.channel
      };
      callZome(
        dispatch,
        rootState,
        "chat",
        "create_channel",
        holochainPayload
      ).then(committedChannel => {
        logItToConsole("createChannel zome done", Date.now());
        committedChannel.last_seen = { First: null };
        commit("createChannel", { ...committedChannel, messages: [] });
        console.log("created channel : ", committedChannel);
        rootState.hcDb.elementalChat
          .put(
            { ...committedChannel, messages: [] },
            committedChannel.channel.uuid
          )
          .then(logItToConsole("createChannel dexie done", Date.now()))
          .catch(error => logItToConsole(error));
        dispatch("setChannel", { ...committedChannel, messages: [] });
      });
    },
    listChannels({ commit, rootState, state, dispatch }, payload) {
      logItToConsole("listChannels start", Date.now());
      rootState.hcDb.elementalChat.get(payload.category).then(channels => {
        logItToConsole("get listChannels dexie done", Date.now());
        if (channels === undefined) channels = [];
        commit("setChannels", channels);
      });
      logItToConsole("listChannels zome start", Date.now());
      callZome(dispatch, rootState, "chat", "list_channels", payload).then(
        result => {
          logItToConsole("listChannels zome done", Date.now());
          commit("setChannels", result.channels);
          logItToConsole("put listChannels dexie start", Date.now());
          rootState.hcDb.elementalChat
            .put(result.channels, payload.category)
            .then(logItToConsole("put listChannels dexie done", Date.now()))
            .catch(error => logItToConsole(error));
          console.log(">>> SETTING channels in indexDb : ", result.channels);
          if (state.channel.info.name === "" && result.channels.length > 0) {
            dispatch("setChannel", { ...result.channels[0], messages: [] });
          }
        }
      );
    },
    addSignalMessageToChannel: async (
      { commit, rootState, state },
      payload
    ) => {
      const {
        channelData: signalChannel,
        messageData: signalMessage
      } = payload;
      console.log(signalMessage);
      console.log(signalChannel);
      logItToConsole("new message signal received", Date.now());
      // verify channel (within which the message belongs) exists
      const appChannel = state.channels.find(
        channel => channel.channel.uuid === signalChannel.channel.uuid
      );
      console.log("here");
      if (!appChannel) throw new Error("No channel exists for this message...");
      console.log("App CHANNEL : ", appChannel);

      rootState.hcDb.elementalChat
        .get(appChannel.channel.uuid)
        .then(channel => {
          console.log("here");
          console.log();
          // verify message for channel does not already exist
          const messageExists = !!channel.messages.find(
            message => message.message.uuid === signalMessage.message.uuid
          );
          console.log("messageExists", messageExists);
          if (messageExists) return;

          console.log("received signal message : ", signalMessage);
          // if new message push to channel message list and update the channel
          const internalMessages = channel.messages.push(signalMessage.message);
          const internalChannel = {
            ...signalChannel,
            last_seen: { Message: signalMessage.message.entryHash },
            messages: internalMessages
          };

          console.log("adding signal message to the channel", internalChannel);
          logItToConsole("addSignalMessageToChannel dexie start", Date.now());
          commit("setChannel", internalChannel);
          rootState.hcDb.elementalChat
            .put(internalChannel, appChannel.channel.uuid)
            .then(
              logItToConsole("addSignalMessageToChannel dexie done", Date.now())
            )
            .catch(error => logItToConsole(error));
        })
        .catch(error => logItToConsole(error));
      console.log("here");
    },
    addMessageToChannel: async (
      { commit, rootState, state, dispatch },
      payload
    ) => {
      logItToConsole("addMessageToChannel start", Date.now());
      const holochainPayload = {
        last_seen: payload.channel.last_seen,
        channel: payload.channel.channel,
        message: {
          ...payload.message,
          content: `${rootState.agentHandle.toUpperCase()}:
      ${payload.message.content}`
        }
      };
      callZome(dispatch, rootState, "chat", "create_message", holochainPayload)
        .then(message => {
          logItToConsole("addMessageToChannel zome done", Date.now());
          const signalMessageData = {
            messageData: message,
            channelData: payload.channel
          };
          console.log(signalMessageData);
          console.log(payload.channel);
          const internalMessages = [...state.channel.messages];
          internalMessages.push(message);
          const internalChannel = {
            ...payload.channel,
            last_seen: { Message: message.entryHash },
            messages: internalMessages
          };
          commit("setChannel", internalChannel);
          console.log("created message for channel", internalChannel);
          logItToConsole("addMessageToChannel dexie start", Date.now());
          rootState.hcDb.elementalChat
            .put(internalChannel, payload.channel.channel.uuid)
            .then(logItToConsole("addMessageToChannel dexie done", Date.now()))
            .catch(error => logItToConsole(error));
          // TODO: Don't need to wait for the result of this but I don't know how
          // to send without waiting for the response.
          rootState.holochainClient
            .callZome({
              cap: null,
              cell_id: rootState.appInterface.cellId,
              zome_name: "chat",
              fn_name: "signal_users_on_channel",
              provenance: rootState.agentKey,
              payload: signalMessageData
            })
            .then(logItToConsole("Signal users done", Date.now()))
            .catch(error => logItToConsole(error));
        })
        .catch(error => logItToConsole(error));
    },
    listMessages({ commit, rootState, dispatch }, payload) {
      logItToConsole("listMessages start", Date.now());
      const holochainPayload = {
        channel: payload.channel.channel,
        date: payload.date
      };
      callZome(dispatch, rootState, "chat", "list_messages", holochainPayload)
        .then(result => {
          logItToConsole("listMessages zome done", Date.now());
          payload.channel.last_seen = { First: null };
          if (result.messages.length > 0) {
            payload.channel.last_seen = {
              Message: result.messages[result.messages.length - 1].entryHash
            };
          }
          const internalChannel = {
            ...payload.channel,
            messages: result.messages
          };
          commit("setChannelMessages", internalChannel);
          logItToConsole("put listMessages dexie start", Date.now());
          rootState.hcDb.elementalChat
            .put(internalChannel, payload.channel.channel.uuid)
            .then(logItToConsole("put listMessages dexie done", Date.now()))
            .catch(error => logItToConsole(error));
        })
        .catch(error => logItToConsole(error));
    },
    diplayErrorMessage({ commit }, payload) {
      commit("setError", payload);
    },
    resetElementalChat({ rootState, commit }) {
      console.log("Clearing Elemental Chat from HCDB...");
      rootState.hcDb.delete();
      commit("resetState");
    },
    async rehydrateChannels({ dispatch, commit, rootState }) {
      dispatch("listChannels", { category: "General" });
      let channels = [];
      await rootState.hcDb.elementalChat.each(channelEntry => {
        if (channelEntry.length === 0) return;
        if (channelEntry.length > 0) {
          channelEntry.map(channel => channels.push(channel));
        } else {
          channels.push(channelEntry);
        }
      });
      const uniqueChannels = channels.reduce((acc, current) => {
        // console.log(" >>", current);
        const x = acc.find(
          channel => channel.channel.uuid === current.channel.uuid
        );
        if (!x) return acc.concat([current]);
        else return acc;
      }, []);
      console.log("setting unique channels : ", uniqueChannels);
      commit(">> setChannelState", uniqueChannels);
    }
  },
  mutations: {
    setChannel(state, payload) {
      state.channel = { ...payload };
    },
    setChannels(state, payload) {
      state.channels = payload;
    },
    setChannelMessages(state, payload) {
      state.channels = state.channels.map(channel =>
        channel.channel.uuid !== payload.channel.uuid
          ? channel
          : { ...channel, ...payload }
      );
      if (state.channel.channel.uuid === payload.channel.uuid) {
        state.channel = { ...payload };
      }
    },
    createChannel(state, payload) {
      state.channels.push(payload);
    },
    setError(state, payload) {
      state.error = payload;
    },
    resetState(state) {
      (state.channels = []),
        (state.channel = {
          info: { name: "" },
          channel: { category: "General", uuid: "" },
          messages: []
        });
    },
    setChannelState(state, payload) {
      state.channels = payload;
    }
  }
};
