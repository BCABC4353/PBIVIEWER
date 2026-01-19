import { useState } from 'react'
import { cn } from './lib/utils'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Report Framework
        </h1>
        <p className="text-gray-600 mb-8">
          Vite + React + Tailwind CSS
        </p>
        <button
          onClick={() => setCount((count) => count + 1)}
          className={cn(
            "px-6 py-3 rounded-lg font-medium",
            "bg-gray-900 text-white",
            "hover:bg-gray-800 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          )}
        >
          Count is {count}
        </button>
      </div>
    </div>
  )
}

export default App
