import mongoose, { Document, Schema, Types } from 'mongoose'

export interface ISharedTodo extends Document {
	listId: Types.ObjectId
	title: string
	isCompleted: boolean
	createdAt: Date
}

const SharedTodoSchema = new Schema<ISharedTodo>({
	listId: { type: Schema.Types.ObjectId, ref: 'List', required: true, index: true },
	title: { type: String, required: false, default: '' },
	isCompleted: { type: Boolean, default: false },
	createdAt: { type: Date, default: Date.now },
})

export const SharedTodo = mongoose.model<ISharedTodo>('SharedTodo', SharedTodoSchema)
