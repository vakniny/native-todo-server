import mongoose, { Document, Schema } from 'mongoose'

export interface IList extends Document {
	name: string
	inviteCode: string
	memberIds: string[]
	createdAt: Date
}

const ListSchema = new Schema<IList>({
	name: { type: String, required: true, trim: true },
	inviteCode: { type: String, required: true, unique: true, index: true },
	memberIds: { type: [String], default: [] },
	createdAt: { type: Date, default: Date.now },
})

export const List = mongoose.model<IList>('List', ListSchema)
