import * as fs from 'fs'
import * as http from 'http'
import * as path from 'path'
import * as urllib from 'url'
import * as archiver from 'archiver'

import {makederp} from './makederp'

interface DownloadMessage {
	url: string
	path: string
}

function pixivGet(pixivUrl:string) : Promise<http.IncomingMessage> {
	let referer = urllib.resolve(pixivUrl, '/');
	let url = urllib.parse(pixivUrl);

	return new Promise(resolve => {
		http.get({
			protocol: url.protocol,
			hostname: url.hostname,
			port: url.port,
			path: url.path,
			headers: {
				referer: referer
			}
		}, resolve).setTimeout(10000);
	});
}

export function downloadFromPixiv(msg:DownloadMessage):Promise<boolean> {
	return makederp(path.dirname(msg.path))
		.then(() => pixivGet(msg.url).then(response => new Promise((resolve, reject) => {
			response.pipe(fs.createWriteStream(msg.path))
					.on('finish', () => {
						response.socket.destroy();
						resolve(msg)
					})
					.on('error', () => reject('error while writing to file'));
		}))).then(() => true).catch(() => false);
}

export function downloadFilesToZip(files: string[], zipPath:string) :Promise<void> {
	let archive = archiver.create('zip', {});
	return makederp(path.dirname(zipPath))
		.then(() => Promise.all(files.map(fileUrl => // wait for all the files to...
			pixivGet(fileUrl).then(response => // set up the download stream
				archive.append(response, {name: path.basename(fileUrl)})) // and add it to the zip
		)))
		.then(() =>  new Promise(resolve => {
			// Once the zip streams have been registered, set up the output stream.
			let outputStream = fs.createWriteStream(zipPath)
				// .on('finish', resolve)
				// .on('error', () => reject('error while writing to file'));
			archive.on('end', resolve);
			archive.pipe(outputStream);
			archive.finalize();
		}))
		.then(() => Promise.resolve())
}

export function getDataUrlDetails(dataUrl:string) {
	const rx = /^data:([^/]+)\/([^;]+);base64,(.+)$/;
	let match = rx.exec(dataUrl);
	if (match != null) {
		return {
			mime: {
				type: match[1],
				subtype: match[2],
			},
			content: match[3],
		}
	}
	return undefined;
}

export function writeBase64(filename:string, content:string) :Promise<void> {
	return new Promise<void>((resolve, reject) => {
		fs.writeFile(filename, new Buffer(content, 'base64'), err => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		})
	})
}