import express, { Request, Response } from 'express'
import mongoose, { Document } from 'mongoose'
import cors from 'cors'
import process from 'process'

const app = express()
app.use(express.json())
app.use(cors())

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/todo-app'

mongoose
	.connect(MONGO_URI)
	.then(() => console.log('✅ Connected to MongoDB'))
	.catch((err) => console.error('❌ MongoDB connection error:', err))

interface ITodo extends Document {
	title: string
	isCompleted: boolean
	createdAt: Date
}

const SharedTodoSchema = new mongoose.Schema<ITodo>({
	title: { type: String, required: false, default: '' },
	isCompleted: { type: Boolean, default: false },
	createdAt: { type: Date, default: Date.now },
})

const SharedTodo = mongoose.model<ITodo>('SharedTodo', SharedTodoSchema)

app.get('/api/shared-todos', async (req: Request, res: Response) => {
	try {
		const todos = await SharedTodo.find().sort({ createdAt: -1 })
		res.json(todos)
	} catch (error: any) {
		res.status(500).json({ message: error.message })
	}
})

app.post('/api/shared-todos', async (req: Request, res: Response) => {
	try {
		const newTodo = new SharedTodo({
			title: req.body.title,
		})
		const savedTodo = await newTodo.save()
		res.status(201).json(savedTodo)
	} catch (error: any) {
		res.status(400).json({ message: error.message })
	}
})

app.patch(
	'/api/shared-todos/:id',
	async (req: Request, res: Response): Promise<void> => {
		try {
			const todo = await SharedTodo.findById(req.params.id)
			if (!todo) {
				res.status(404).json({ message: 'Todo not found' })
				return
			}

			const { title, isCompleted } = req.body

			if (typeof title === 'string') {
				todo.title = title
			}
			if (typeof isCompleted === 'boolean') {
				todo.isCompleted = isCompleted
			}

			await todo.save()
			res.json(todo)
		} catch (error: any) {
			res.status(400).json({ message: error.message })
		}
	},
)

app.delete(
	'/api/shared-todos/:id',
	async (req: Request, res: Response): Promise<void> => {
		try {
			const result = await SharedTodo.findByIdAndDelete(req.params.id)
			if (!result) {
				res.status(404).json({ message: 'Todo not found' })
				return
			}
			res.json({ message: 'Todo deleted successfully' })
		} catch (error: any) {
			res.status(400).json({ message: error.message })
		}
	},
)

app.listen(3000, '0.0.0.0', () => {
	console.log('🚀 Server is running on port 3000')
})
