<template>
  <div class="chat-container">
    <!-- 顶栏 -->
    <div class="nav-bar">
      <div class="nav-title">
        <span class="ai-dot"></span>
        AI 语音助手
        <span class="model-tag">DeepSeek</span>
      </div>
      <div class="nav-actions">
        <div class="lang-switch" @click="toggleLang">
          <span :class="{ active: langMode === 'zh' }">中</span>
          <span class="divider">/</span>
          <span :class="{ active: langMode === 'en' }">EN</span>
          <span :class="{ active: langMode === 'auto' }" class="auto-tag">AUTO</span>
        </div>
        <button class="icon-btn" @click="clearHistory" title="清空对话">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 消息列表 -->
    <div class="message-list" ref="scrollContainer">
      <div v-if="messages.length <= 1" class="welcome-tips">
        <div class="tip-card" @click="quickSend('你好，请介绍一下你自己')">💬 你好，介绍一下自己</div>
        <div class="tip-card" @click="quickSend('帮我写一首关于春天的诗')">🌸 写一首关于春天的诗</div>
        <div class="tip-card" @click="quickSend('用英文解释 machine learning')">🤖 Explain machine learning</div>
      </div>

      <div
        v-for="(msg, index) in messages"
        :key="index"
        :class="['msg-item', msg.role]"
      >
        <div class="avatar">
          <span v-if="msg.role === 'user'">ME</span>
          <span v-else>AI</span>
        </div>
        <div class="bubble-wrap">
          <div :class="['content', { typing: msg.isTyping }]">
            <span v-if="msg.isTyping" class="typing-dots">
              <span></span><span></span><span></span>
            </span>
            <span v-else>{{ msg.content }}</span>
          </div>

          <!-- AI 消息操作栏 -->
          <div v-if="msg.role === 'assistant' && !msg.isTyping && msg.content" class="msg-actions">
            <button @click="speakMessage(msg.content, index)" :title="speakingIndex === index ? '暂停/继续' : '朗读'">
              <span v-if="speakingIndex === index && !isSpeechPaused">⏸</span>
              <span v-else-if="speakingIndex === index && isSpeechPaused">▶️</span>
              <span v-else>🔊</span>
            </button>
            <button @click="copyText(msg.content)" title="复制">📋</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部输入区 -->
    <div class="input-bar">
      <div class="lang-indicator">
        识别语言：
        <span
          v-for="opt in langOptions"
          :key="opt.value"
          :class="['lang-opt', { selected: langMode === opt.value }]"
          @click="langMode = opt.value"
        >
          {{ opt.label }}
        </span>
      </div>

      <div class="input-row">
        <button
          :class="['voice-btn', { recording: isRecording }]"
          @click="handleVoiceInput"
          :title="isRecording ? '点击停止录音' : '点击开始录音'"
        >
          <svg v-if="!isRecording" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
            <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 008 8.94V23h2v-2.06A9 9 0 0021 12v-2h-2z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        </button>

        <textarea
          v-model="inputText"
          :placeholder="isRecording ? '🎤 录音中，点击麦克风停止...' : '输入消息，或点击麦克风录音...'"
          :disabled="isRecording"
          @keydown.enter.prevent="handleEnter"
          rows="1"
          ref="textareaRef"
          @input="autoResize"
        ></textarea>

        <button
          class="send-btn"
          @click="sendMessage"
          :disabled="!inputText.trim() || isLoading"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>

      <div v-if="isRecording" class="recording-indicator">
        <div class="wave-bar" v-for="i in 5" :key="i" :style="{ animationDelay: `${i * 0.1}s` }"></div>
        <span>正在录音，说完后点击停止...</span>
      </div>
    </div>

    <!-- Toast -->
    <transition name="toast">
      <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { fetchChatStream } from './api/llm'
import { speakText, stopSpeak, startSpeechRecognition } from './api/speech'

type LangMode = 'zh' | 'en' | 'auto'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isTyping?: boolean
}

const inputText = ref('')
const isRecording = ref(false)
const isLoading = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const messages = ref<Message[]>([])
const toastMsg = ref('')
const langMode = ref<LangMode>('zh')
const stopRecognition = ref<(() => void) | null>(null)

// 朗读状态
const speakingIndex = ref<number | null>(null)
const isSpeechPaused = ref(false)
let speakCheckTimer: ReturnType<typeof setInterval> | null = null

const langOptions = [
  { label: '中文', value: 'zh' as LangMode },
  { label: 'English', value: 'en' as LangMode },
  { label: '自动', value: 'auto' as LangMode },
]

onMounted(() => {
  const saved = localStorage.getItem('chat_history')
  messages.value = saved
    ? JSON.parse(saved)
    : [{ role: 'assistant', content: '你好！我是基于 DeepSeek 的 AI 语音助手，支持中英文语音输入。有什么可以帮你的？😊' }]
  scrollToBottom()

  // 提前触发语音列表加载，避免首次朗读延迟
  window.speechSynthesis.getVoices()
})

onUnmounted(() => {
  stopSpeak()
  if (speakCheckTimer) clearInterval(speakCheckTimer)
})

const showToast = (msg: string) => {
  toastMsg.value = msg
  setTimeout(() => (toastMsg.value = ''), 2500)
}

const scrollToBottom = async () => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

const autoResize = () => {
  const el = textareaRef.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
}

const handleEnter = (e: KeyboardEvent) => {
  if (!e.shiftKey) sendMessage()
}

const toggleLang = () => {
  const order: LangMode[] = ['zh', 'en', 'auto']
  const idx = order.indexOf(langMode.value)
  langMode.value = order[(idx + 1) % order.length]
  const labels = { zh: '中文识别', en: '英文识别', auto: '自动识别' }
  showToast(`已切换为${labels[langMode.value]}`)
}

// 轮询检测朗读是否自然结束
const startSpeakWatcher = (index: number) => {
  if (speakCheckTimer) clearInterval(speakCheckTimer)
  speakCheckTimer = setInterval(() => {
    const synth = window.speechSynthesis
    if (!synth.speaking && !synth.paused) {
      speakingIndex.value = null
      isSpeechPaused.value = false
      if (speakCheckTimer) {
        clearInterval(speakCheckTimer)
        speakCheckTimer = null
      }
    }
  }, 300)
}

const speakMessage = async (text: string, index: number) => {
  const speakLang = langMode.value === 'en' ? 'en-US' : 'zh-CN'

  // 点击【不同】消息 → 停掉当前，重新朗读
  if (speakingIndex.value !== null && speakingIndex.value !== index) {
    stopSpeak()
    if (speakCheckTimer) clearInterval(speakCheckTimer)
    speakingIndex.value = index
    isSpeechPaused.value = false
    await speakText(text, speakLang)
    startSpeakWatcher(index)
    showToast('🔊 正在朗读...')
    return
  }

  // 点击【同一条】消息 → 暂停 / 继续 / 重新播放
  const state = await speakText(text, speakLang)

  if (state === 'paused') {
    isSpeechPaused.value = true
    showToast('⏸ 已暂停')
  } else if (state === 'resumed') {
    isSpeechPaused.value = false
    showToast('▶️ 继续朗读')
  } else {
    speakingIndex.value = index
    isSpeechPaused.value = false
    startSpeakWatcher(index)
    showToast('🔊 正在朗读...')
  }
}

const handleVoiceInput = () => {
  if (!isRecording.value) {
    isRecording.value = true
    showToast('🎤 开始录音，说完后点击停止')

    stopRecognition.value = startSpeechRecognition(
      langMode.value,
      (text) => {
        isRecording.value = false
        stopRecognition.value = null
        if (text?.trim()) {
          inputText.value = text
          autoResize()
          showToast('✅ 识别成功')
        } else {
          showToast('⚠️ 未识别到内容，请重试')
        }
      },
      (err) => {
        isRecording.value = false
        stopRecognition.value = null
        showToast('❌ ' + err)
      }
    )
  } else {
    if (stopRecognition.value) {
      stopRecognition.value()
      stopRecognition.value = null
    }
    isRecording.value = false
  }
}

const sendMessage = async () => {
  const text = inputText.value.trim()
  if (!text || isLoading.value) return

  // 发送新消息时停止当前朗读
  stopSpeak()
  speakingIndex.value = null
  isSpeechPaused.value = false
  if (speakCheckTimer) clearInterval(speakCheckTimer)

  inputText.value = ''
  if (textareaRef.value) textareaRef.value.style.height = 'auto'

  messages.value.push({ role: 'user', content: text })
  await scrollToBottom()

  const assistantMsg: Message = { role: 'assistant', content: '', isTyping: true }
  messages.value.push(assistantMsg)
  isLoading.value = true

  try {
    const apiMessages = messages.value
      .slice(0, -1)
      .map(({ role, content }) => ({ role, content }))

    await fetchChatStream(apiMessages, (chunk) => {
      if (assistantMsg.isTyping) assistantMsg.isTyping = false
      assistantMsg.content += chunk
      scrollToBottom()
    })

    localStorage.setItem(
      'chat_history',
      JSON.stringify(messages.value.map(({ role, content }) => ({ role, content })))
    )

    // 回复完成后自动朗读
    const lastIndex = messages.value.length - 1
    const speakLang = langMode.value === 'en' ? 'en-US' : 'zh-CN'
    await speakText(assistantMsg.content, speakLang)
    speakingIndex.value = lastIndex
    isSpeechPaused.value = false
    startSpeakWatcher(lastIndex)
  } catch (e: any) {
    assistantMsg.isTyping = false
    assistantMsg.content = '❌ AI 响应失败：' + (e.message || '请检查 API Key 和账户余额')
  } finally {
    isLoading.value = false
  }
}

const quickSend = (text: string) => {
  inputText.value = text
  sendMessage()
}

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast('✅ 已复制到剪贴板')
  } catch {
    showToast('❌ 复制失败')
  }
}

const clearHistory = () => {
  if (confirm('确定清空对话记录吗？')) {
    stopSpeak()
    speakingIndex.value = null
    isSpeechPaused.value = false
    if (speakCheckTimer) clearInterval(speakCheckTimer)
    messages.value = [{ role: 'assistant', content: '对话已清空，我们重新开始吧！😊' }]
    localStorage.removeItem('chat_history')
  }
}
</script>

<style scoped>
.chat-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

/* 顶栏 */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 10;
}
.nav-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}
.ai-dot {
  width: 8px; height: 8px;
  background: #4ade80;
  border-radius: 50%;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
}
.model-tag {
  font-size: 11px;
  background: rgba(255,255,255,0.2);
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 400;
}
.nav-actions { display: flex; align-items: center; gap: 12px; }
.lang-switch {
  display: flex; align-items: center; gap: 4px;
  background: rgba(255,255,255,0.15);
  padding: 4px 10px; border-radius: 20px;
  cursor: pointer; font-size: 13px; user-select: none;
}
.lang-switch .divider { opacity: 0.5; }
.lang-switch span.active { font-weight: 700; text-decoration: underline; }
.lang-switch .auto-tag { font-size: 11px; opacity: 0.8; }
.icon-btn {
  background: none; border: none; color: white;
  cursor: pointer; padding: 4px;
  display: flex; align-items: center; opacity: 0.85;
  transition: opacity 0.2s;
}
.icon-btn:hover { opacity: 1; }
.icon-btn svg { width: 20px; height: 20px; }

/* 消息列表 */
.message-list {
  flex: 1; overflow-y: auto;
  padding: 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.welcome-tips {
  display: flex; flex-direction: column;
  gap: 8px; margin-bottom: 16px;
}
.tip-card {
  background: white; border: 1px solid #e5e7eb;
  border-radius: 12px; padding: 10px 14px;
  font-size: 14px; color: #555; cursor: pointer;
  transition: all 0.2s;
}
.tip-card:hover { background: #f3f4f6; border-color: #667eea; color: #667eea; }

.msg-item {
  display: flex; align-items: flex-end;
  gap: 8px; margin-bottom: 12px;
}
.msg-item.user { flex-direction: row-reverse; }
.avatar {
  width: 34px; height: 34px; border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white; display: flex; align-items: center;
  justify-content: center; font-size: 10px; font-weight: 600; flex-shrink: 0;
}
.user .avatar { background: linear-gradient(135deg, #4ade80, #22c55e); }
.bubble-wrap { display: flex; flex-direction: column; max-width: 72%; }
.content {
  padding: 10px 14px; border-radius: 18px;
  background: white; font-size: 14px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08); color: #1a1a1a;
}
.user .content {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}
.typing-dots span {
  display: inline-block; width: 6px; height: 6px;
  background: #999; border-radius: 50%; margin: 0 2px;
  animation: bounce 1.2s infinite;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}
.msg-actions {
  display: flex; gap: 4px;
  margin-top: 4px; padding-left: 4px;
}
.msg-actions button {
  background: none; border: none; cursor: pointer;
  font-size: 16px; padding: 2px 6px; border-radius: 8px;
  opacity: 0.6; transition: opacity 0.2s, background 0.2s;
}
.msg-actions button:hover { opacity: 1; background: rgba(0,0,0,0.06); }

/* 底部输入区 */
.input-bar {
  background: white; border-top: 1px solid #e5e7eb;
  padding: 10px 12px 12px;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.06);
}
.lang-indicator {
  font-size: 12px; color: #9ca3af;
  margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
}
.lang-opt {
  padding: 2px 8px; border-radius: 10px;
  cursor: pointer; transition: all 0.2s; border: 1px solid transparent;
}
.lang-opt:hover { color: #667eea; }
.lang-opt.selected {
  background: #eef2ff; color: #667eea;
  border-color: #c7d2fe; font-weight: 600;
}
.input-row { display: flex; align-items: flex-end; gap: 8px; }
.voice-btn {
  width: 40px; height: 40px; border-radius: 50%;
  border: none; background: #eef2ff; color: #667eea;
  cursor: pointer; display: flex; align-items: center;
  justify-content: center; flex-shrink: 0; transition: all 0.2s;
}
.voice-btn svg { width: 18px; height: 18px; }
.voice-btn:hover { background: #e0e7ff; }
.voice-btn.recording {
  background: #fee2e2; color: #ef4444;
  animation: recording-pulse 1s infinite;
}
@keyframes recording-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
  50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
}
textarea {
  flex: 1; border: 1px solid #e5e7eb;
  border-radius: 20px; padding: 10px 14px;
  font-size: 14px; resize: none; outline: none;
  line-height: 1.5; max-height: 120px; overflow-y: auto;
  transition: border-color 0.2s; font-family: inherit;
}
textarea:focus { border-color: #667eea; }
textarea:disabled { background: #f9fafb; color: #9ca3af; }
.send-btn {
  width: 40px; height: 40px; border-radius: 50%;
  border: none; background: linear-gradient(135deg, #667eea, #764ba2);
  color: white; cursor: pointer; display: flex;
  align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.2s;
}
.send-btn svg { width: 18px; height: 18px; }
.send-btn:hover { opacity: 0.9; transform: scale(1.05); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.recording-indicator {
  display: flex; align-items: center; gap: 3px;
  margin-top: 8px; color: #ef4444; font-size: 12px;
}
.wave-bar {
  width: 3px; height: 14px; background: #ef4444;
  border-radius: 2px; animation: wave 0.8s ease-in-out infinite alternate;
}
@keyframes wave {
  from { height: 4px; }
  to { height: 16px; }
}

/* Toast */
.toast {
  position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,0.75); color: white;
  padding: 8px 18px; border-radius: 20px; font-size: 13px;
  z-index: 999; pointer-events: none; white-space: nowrap;
}
.toast-enter-active, .toast-leave-active { transition: opacity 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; }
</style>