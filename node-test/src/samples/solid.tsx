import { createSignal } from 'solid-js'
import { Show } from 'solid-js'

export default function SolidCounter() {
  const [count, setCount] = createSignal(0)
  const [isOpen, setIsOpen] = createSignal(false)

  const increment = () => setCount(count() + 1)
  const decrement = () => setCount(count() - 1)
  const toggle = () => setIsOpen(!isOpen())

  return (
    <div class="p-8 space-y-4">
      <div class={`p-6 rounded-lg shadow-lg ${isOpen() ? 'bg-blue-100' : 'bg-white'}`}>
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold">Solid Counter</h1>
          <button onClick={toggle} class="p-2">
            {isOpen() ? '✕' : '▼'}
          </button>
        </div>

        <div class="text-4xl font-bold text-center my-6">{count()}</div>

        <div class="flex gap-2 justify-center">
          <button onClick={decrement} class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            Decrement
          </button>
          <button onClick={increment} class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Increment
          </button>
        </div>
      </div>

      <Show when={isOpen()}>
        <div class="p-4 bg-gray-100 rounded-lg">
          <p class="text-gray-700">Additional content shown when open</p>
        </div>
      </Show>
    </div>
  )
}
