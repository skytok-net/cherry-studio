import { Background, Controls, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react'
import clsx from 'clsx'
import { ChevronDown, Menu, X } from 'lucide-react'
import React, { useState } from 'react'

export default function ReactCounter() {
  const [count, setCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id: '1', position: { x: 0, y: 0 }, data: { label: 'Node 1' } },
    { id: '2', position: { x: 100, y: 100 }, data: { label: 'Node 2' } }
  ])

  const [edges, setEdges, onEdgesChange] = useEdgesState([{ id: 'e1-2', source: '1', target: '2' }])

  return (
    <div className="p-8 space-y-4">
      <div className={clsx('p-6 rounded-lg shadow-lg', isOpen ? 'bg-blue-100' : 'bg-white')}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Menu size={24} />
            React Counter
          </h1>
          <button onClick={() => setIsOpen(!isOpen)}>{isOpen ? <X size={20} /> : <ChevronDown size={20} />}</button>
        </div>

        <div className="text-4xl font-bold text-center my-6">{count}</div>

        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setCount(count - 1)}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            Decrement
          </button>
          <button
            onClick={() => setCount(count + 1)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Increment
          </button>
        </div>
      </div>

      <div className="h-64 bg-gray-50 rounded-lg border-2 border-gray-200">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}>
          <Controls />
          <Background />
        </ReactFlow>
      </div>
    </div>
  )
}
