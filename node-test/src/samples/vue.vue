<template>
  <div class="p-8 space-y-4">
    <div :class="['p-6 rounded-lg shadow-lg', isOpen ? 'bg-blue-100' : 'bg-white']">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold">Vue Counter</h1>
        <button @click="toggle" class="p-2">
          {{ isOpen ? '✕' : '▼' }}
        </button>
      </div>

      <div class="text-4xl font-bold text-center my-6">{{ count }}</div>

      <div class="flex gap-2 justify-center">
        <button
          @click="decrement"
          class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Decrement
        </button>
        <button
          @click="increment"
          class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Increment
        </button>
      </div>
    </div>

    <div v-if="isOpen" class="p-4 bg-gray-100 rounded-lg">
      <p class="text-gray-700">Additional content shown when open</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const count = ref(0);
const isOpen = ref(false);

function increment() {
  count.value++;
}

function decrement() {
  count.value--;
}

function toggle() {
  isOpen.value = !isOpen.value;
}
</script>

<style scoped>
button {
  cursor: pointer;
  transition: all 0.2s;
}
</style>
