<template>
  <v-app>
    <v-app-bar app dense dark />
    <v-main>
      <v-dialog v-model="shouldDisplayNickPrompt" persistent max-width="320">
        <v-card>
          <v-card-title class="headline">
            ユーザーネームを設定してください
          </v-card-title>
          <v-card-text
            >誰がメッセージを書いたかを簡易的に明確にするために、ユーザーネームがメッセージに付随されます。</v-card-text
          >
          <v-card-text>
            <v-text-field
              v-model="internalAgentHandle"
              label="ユーザーネーム"
              hint="こちらはメッセージに付随されます"
              maxlength="20"
              dark
              outlined
              full-width
              @keydown.enter="agentHandleEntered"
              append-icon="mdi-face-agent"
              @click:append="agentHandleEntered"
            />
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn text @click="agentHandleEntered">
              完了
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <v-dialog
        v-model="shouldDisplayHoloConnecting"
        persistent
        max-width="320"
      >
        <v-card>
          <v-card-title class="headline">
            HoloPortに接続しています...
          </v-card-title>
          <v-card-text>{{ holoConnectionMessage }}</v-card-text>
        </v-card>
      </v-dialog>
      <v-dialog v-model="error.shouldShow" persistent max-width="460">
        <v-card>
          <v-card-title class="headline">
            エラーが発生しました。
          </v-card-title>
          <v-card-text>{{ error.message }}</v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn text @click="clearErrorMessage">
              Ok
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <v-dialog v-model="shouldDisplayDisconnected" persistent max-width="460">
        <v-card>
          <v-card-title class="headline">
            HoloPortに接続しています...
          </v-card-title>
          <v-card-text>
            {{
              reconnectingIn === 0
                ? "接続しています..."
                : `${reconnectingIn}秒後に接続を試みます...`
            }}</v-card-text
          >
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn text @click="retryNow">
              リトライ
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <v-responsive height="100%">
        <transition name="fade">
          <router-view id="router" />
        </transition>
      </v-responsive>
    </v-main>
  </v-app>
</template>

<script>
import { mapState, mapActions } from "vuex";
import { isHoloHosted } from "@/utils";

export default {
  name: "App",
  components: {},
  data() {
    return {
      internalAgentHandle: "",
      dialog: false
    };
  },
  methods: {
    ...mapActions("elementalChat", ["diplayErrorMessage", "setChannelPolling"]),
    ...mapActions(["setAgentHandle", "skipBackoff"]),
    agentHandleEntered() {
      if (this.internalAgentHandle === "") return;
      this.setAgentHandle(this.internalAgentHandle);
      this.dialog = false;
    },
    clearErrorMessage() {
      this.diplayErrorMessage({ message: "", shouldShow: false });
    },
    retryNow() {
      this.skipBackoff();
    }
  },
  computed: {
    ...mapState("elementalChat", ["error"]),
    ...mapState([
      "agentHandle",
      "needsHandle",
      "conductorDisconnected",
      "firstConnect",
      "reconnectingIn",
      "isHoloSignedIn",
      "isChaperoneDisconnected"
    ]),
    shouldDisplayNickPrompt() {
      return (
        this.needsHandle &&
        !this.error.message &&
        !this.conductorDisconnected &&
        !this.shouldDisplayHoloConnecting
      );
    },
    shouldDisplayDisconnected() {
      return this.conductorDisconnected && !this.firstConnect;
    },
    shouldDisplayHoloConnecting() {
      return (
        isHoloHosted() && (!this.isHoloSignedIn || this.isChaperoneDisconnected)
      );
    },
    holoConnectionMessage() {
      if (this.isChaperoneDisconnected) {
        return "HoloPortが見つかりません。インターネット接続を確認してページを更新してください。";
      } else {
        return "HoloPortに接続しています...";
      }
    }
  },
  created() {
    this.$store.dispatch("initialiseStore");
    this.$vuetify.theme.dark = true;
  },
  mounted() {
    this.setChannelPolling();
  }
};
</script>
<style scoped>
#router {
  height: 100% !important;
}
</style>
