import { useState } from 'preact/hooks'

export default function PreactCounter() {
  const [count, setCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  const increment = () => setCount(count + 1)
  const decrement = () => setCount(count - 1)
  const toggle = () => setIsOpen(!isOpen)

  return (
    <div className="p-8 space-y-4">
      <div className={`p-6 rounded-lg shadow-lg ${isOpen ? 'bg-purple-100' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Preact Counter</h1>
          <button onClick={toggle} className="p-2">
            {isOpen ? '✕' : '▼'}
          </button>
        </div>

        <div className="text-4xl font-bold text-center my-6">{count}</div>

        <div className="flex gap-2 justify-center">
          <button onClick={decrement} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            Decrement
          </button>
          <button onClick={increment} className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600">
            Increment
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 bg-gray-100 rounded-lg">
          <p className="text-gray-700">Additional content shown when open</p>
        </div>
      )}
    </div>
  )
}
