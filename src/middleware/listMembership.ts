import { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import { IList, List } from '../models/List'

export interface ListRequest extends Request {
	list?: IList
	deviceId?: string
}

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

// Header only. Reading the device id from the query string would put the sole
// credential into proxy/CDN access logs, and reading it from the body lets it
// diverge from the header the rest of the pipeline trusts.
export const getDeviceId = (req: Request): string | undefined => {
	const header = req.header('x-device-id')
	if (header && DEVICE_ID_PATTERN.test(header)) return header
	return undefined
}

// Loads the list from :listId, verifies the requesting device is a member,
// and attaches both to the request for downstream handlers.
export const requireListMembership = async (
	req: ListRequest,
	res: Response,
	next: NextFunction,
): Promise<void> => {
	const { listId } = req.params

	if (!mongoose.isValidObjectId(listId)) {
		res.status(400).json({ message: 'Invalid list id' })
		return
	}

	const deviceId = getDeviceId(req)
	if (!deviceId) {
		res.status(400).json({ message: 'Device id is required' })
		return
	}

	const list = await List.findById(listId)
	if (!list) {
		res.status(404).json({ message: 'List not found' })
		return
	}

	if (!list.memberIds.includes(deviceId)) {
		res.status(403).json({ message: 'Not a member of this list' })
		return
	}

	req.list = list
	req.deviceId = deviceId
	next()
}
