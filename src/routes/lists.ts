import { Request, Response, Router } from 'express'
import mongoose from 'mongoose'
import { List } from '../models/List'
import { SharedTodo } from '../models/SharedTodo'
import {
	getDeviceId,
	ListRequest,
	requireListMembership,
} from '../middleware/listMembership'
import { createUniqueInviteCode, isValidInviteCode } from '../utils/inviteCode'
import { joinLimiter } from '../middleware/rateLimit'

const router = Router()

const MAX_NAME_LENGTH = 80
const MAX_TITLE_LENGTH = 500

const serializeList = (list: {
	_id: unknown
	name: string
	inviteCode: string
	memberIds: string[]
}) => ({
	_id: list._id,
	name: list.name,
	inviteCode: list.inviteCode,
	memberCount: list.memberIds.length,
})

// Handler errors carry Mongoose/Mongo internals, so they are logged server-side
// and never echoed to the client.
const fail = (res: Response, status: number, message: string, error?: unknown) => {
	if (error) console.error(`[lists] ${message}:`, error)
	res.status(status).json({ message })
}

const readName = (value: unknown): string | null => {
	if (typeof value !== 'string') return null
	const trimmed = value.trim()
	if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return null
	return trimmed
}

const readTitle = (value: unknown): string | null => {
	if (typeof value !== 'string') return null
	if (value.length > MAX_TITLE_LENGTH) return null
	return value
}

// POST /api/lists — create a folder; creator becomes its first member.
router.post('/', async (req: Request, res: Response) => {
	try {
		const name = readName(req.body?.name)
		const deviceId = getDeviceId(req)

		if (!name) {
			fail(res, 400, `name is required (max ${MAX_NAME_LENGTH} characters)`)
			return
		}
		if (!deviceId) {
			fail(res, 400, 'Device id is required')
			return
		}

		const inviteCode = await createUniqueInviteCode()
		const list = await new List({
			name,
			inviteCode,
			memberIds: [deviceId],
		}).save()

		res.status(201).json(serializeList(list))
	} catch (error) {
		fail(res, 500, 'Could not create the folder', error)
	}
})

// GET /api/lists/join/:inviteCode — resolve a code to list metadata (no side
// effect). The invite code is the only secret guarding a folder, so this route
// is rate limited and never reveals the code back to an unauthenticated caller.
router.get('/join/:inviteCode', joinLimiter, async (req: Request, res: Response) => {
	try {
		const inviteCode = String(req.params.inviteCode).trim().toUpperCase()
		if (!isValidInviteCode(inviteCode)) {
			fail(res, 404, 'Invite code not found')
			return
		}

		const list = await List.findOne({ inviteCode })
		if (!list) {
			fail(res, 404, 'Invite code not found')
			return
		}

		res.json({
			_id: list._id,
			name: list.name,
			memberCount: list.memberIds.length,
		})
	} catch (error) {
		fail(res, 500, 'Could not look up that invite code', error)
	}
})

// POST /api/lists/:listId/join — register this device as a member (idempotent).
// The invite code MUST be supplied and verified: ObjectIds are guessable
// (shared per-process random + incrementing counter), so accepting a bare
// listId here would hand any folder to anyone who can enumerate ids.
router.post('/:listId/join', joinLimiter, async (req: Request, res: Response) => {
	try {
		const { listId } = req.params
		const deviceId = getDeviceId(req)
		const inviteCode = String(req.body?.inviteCode ?? '')
			.trim()
			.toUpperCase()

		if (!mongoose.isValidObjectId(listId)) {
			fail(res, 400, 'Invalid list id')
			return
		}
		if (!deviceId) {
			fail(res, 400, 'Device id is required')
			return
		}
		if (!isValidInviteCode(inviteCode)) {
			fail(res, 403, 'A valid invite code is required to join')
			return
		}

		// Matching on both id and code in one query keeps the failure response
		// identical whether the id is wrong, the code is wrong, or both.
		const list = await List.findOneAndUpdate(
			{ _id: listId, inviteCode },
			{ $addToSet: { memberIds: deviceId } },
			{ new: true },
		)

		if (!list) {
			fail(res, 403, 'A valid invite code is required to join')
			return
		}

		res.json(serializeList(list))
	} catch (error) {
		fail(res, 500, 'Could not join the folder', error)
	}
})

// POST /api/lists/:listId/leave — unregister this device; cascade-delete the
// list and its todos once the last member has left.
router.post(
	'/:listId/leave',
	requireListMembership,
	async (req: ListRequest, res: Response) => {
		try {
			const list = await List.findByIdAndUpdate(
				req.list!._id,
				{ $pull: { memberIds: req.deviceId! } },
				{ new: true },
			)

			if (!list) {
				fail(res, 404, 'List not found')
				return
			}

			if (list.memberIds.length === 0) {
				await SharedTodo.deleteMany({ listId: list._id })
				await List.findByIdAndDelete(list._id)
				res.json({ deleted: true, memberCount: 0 })
				return
			}

			res.json({ deleted: false, memberCount: list.memberIds.length })
		} catch (error) {
			fail(res, 500, 'Could not leave the folder', error)
		}
	},
)

// PATCH /api/lists/:listId — rename a folder (members only).
router.patch(
	'/:listId',
	requireListMembership,
	async (req: ListRequest, res: Response) => {
		try {
			const name = readName(req.body?.name)
			if (!name) {
				fail(res, 400, `name is required (max ${MAX_NAME_LENGTH} characters)`)
				return
			}

			req.list!.name = name
			await req.list!.save()

			res.json(serializeList(req.list!))
		} catch (error) {
			fail(res, 500, 'Could not rename the folder', error)
		}
	},
)

// GET /api/lists/:listId — folder metadata (members only).
router.get(
	'/:listId',
	requireListMembership,
	async (req: ListRequest, res: Response) => {
		res.json(serializeList(req.list!))
	},
)

// GET /api/lists/:listId/todos — todos inside a folder (members only).
router.get(
	'/:listId/todos',
	requireListMembership,
	async (req: ListRequest, res: Response) => {
		try {
			const todos = await SharedTodo.find({ listId: req.list!._id }).sort({
				createdAt: -1,
			})
			res.json(todos)
		} catch (error) {
			fail(res, 500, 'Could not load todos', error)
		}
	},
)

// POST /api/lists/:listId/todos — create a todo inside a folder (members only).
router.post(
	'/:listId/todos',
	requireListMembership,
	async (req: ListRequest, res: Response) => {
		try {
			const title = readTitle(req.body?.title ?? '')
			if (title === null) {
				fail(res, 400, `title must be a string of at most ${MAX_TITLE_LENGTH} characters`)
				return
			}

			const todo = await new SharedTodo({
				listId: req.list!._id,
				title,
			}).save()
			res.status(201).json(todo)
		} catch (error) {
			fail(res, 500, 'Could not create the todo', error)
		}
	},
)

// PATCH /api/lists/:listId/todos/:todoId — update a todo (members only).
router.patch(
	'/:listId/todos/:todoId',
	requireListMembership,
	async (req: ListRequest, res: Response) => {
		try {
			const { todoId } = req.params
			if (!mongoose.isValidObjectId(todoId)) {
				fail(res, 400, 'Invalid todo id')
				return
			}

			const { title, isCompleted } = req.body ?? {}
			if (title !== undefined && readTitle(title) === null) {
				fail(res, 400, `title must be a string of at most ${MAX_TITLE_LENGTH} characters`)
				return
			}

			const todo = await SharedTodo.findOne({
				_id: todoId,
				listId: req.list!._id,
			})
			if (!todo) {
				fail(res, 404, 'Todo not found')
				return
			}

			if (typeof title === 'string') {
				todo.title = title
			}
			if (typeof isCompleted === 'boolean') {
				todo.isCompleted = isCompleted
			}

			await todo.save()
			res.json(todo)
		} catch (error) {
			fail(res, 500, 'Could not update the todo', error)
		}
	},
)

// DELETE /api/lists/:listId/todos/:todoId — delete a todo (members only).
router.delete(
	'/:listId/todos/:todoId',
	requireListMembership,
	async (req: ListRequest, res: Response) => {
		try {
			const { todoId } = req.params
			if (!mongoose.isValidObjectId(todoId)) {
				fail(res, 400, 'Invalid todo id')
				return
			}

			const result = await SharedTodo.findOneAndDelete({
				_id: todoId,
				listId: req.list!._id,
			})
			if (!result) {
				fail(res, 404, 'Todo not found')
				return
			}
			res.json({ message: 'Todo deleted successfully' })
		} catch (error) {
			fail(res, 500, 'Could not delete the todo', error)
		}
	},
)

export default router
