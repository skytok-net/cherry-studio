<script>
  let count = 0;
  let isOpen = false;

  function increment() {
    count += 1;
  }

  function decrement() {
    count -= 1;
  }

  function toggle() {
    isOpen = !isOpen;
  }
</script>

<div class="p-8 space-y-4">
  <div class={`p-6 rounded-lg shadow-lg ${isOpen ? 'bg-blue-100' : 'bg-white'}`}>
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-bold">Svelte Counter</h1>
      <button on:click={toggle} class="p-2">
        {isOpen ? '✕' : '▼'}
      </button>
    </div>

    <div class="text-4xl font-bold text-center my-6">{count}</div>

    <div class="flex gap-2 justify-center">
      <button
        on:click={decrement}
        class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Decrement
      </button>
      <button
        on:click={increment}
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Increment
      </button>
    </div>
  </div>

  {#if isOpen}
    <div class="p-4 bg-gray-100 rounded-lg">
      <p class="text-gray-700">Additional content shown when open</p>
    </div>
  {/if}
</div>

<style>
  button {
    cursor: pointer;
    transition: all 0.2s;
  }
</style>
