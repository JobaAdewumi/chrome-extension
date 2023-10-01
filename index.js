const express = require('express');
const app = express();
const busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const { Pool } = require('pg');
require('dotenv').config();
const port = 3000;

app.use(express.json());

// Define a directory to save uploaded files
const uploadDir = path.join(__dirname, 'videos');
fs.mkdirSync(uploadDir, { recursive: true });

const pool = new Pool({
	user: process.env.USERNAME_DATA,
	host: process.env.HOST,
	database: process.env.DATABASE,
	password: process.env.PASSWORD,
  port: 5432,
  ssl: true
});
console.log(process.env.USERNAME_DATA);
console.log(process.env.PASSWORD);
console.log(process.env.DATABASE);
pool.query(
	`CREATE TABLE uploaded_files(  
    id int NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id VARCHAR(255),
    file_name VARCHAR(255),
    file_path VARCHAR(255)
);`,
	[],
	(error, results) => {
		if (error) {
			console.error('Error inserting into database:', error);
		} else {
			console.log('Table created inserted into database.');
		}
	}
);

app.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
});

app.post('/create', (req, res) => {
	const userId = req.query.id;
	const fileName = req.query.file;
	const mp4FilePath = req.query.path;
	console.log(req.query);
	console.log(userId);
	console.log(fileName);
	console.log(mp4FilePath);
	const body = req.body;

	const custom = uuid.v4();

	pool.query(
		'INSERT INTO uploaded_files (user_id) VALUES ($1)',
		[custom],
		(error, results) => {
			if (error) {
				console.error('Error inserting into database:', error);
				res.status(500).json({ error: 'Error inserting into database' });
			} else {
				console.log('File information inserted into database.');

				res.status(201).json(custom);
			}
		}
	);
});

// Create a POST endpoint to handle Blob data
app.post('/upload', (req, res) => {
	const userId = req.query.id;
	if (userId == '') {
		res.status(400).json({ error: 'Parameter id is null' });
	}
	const bb = new busboy({ headers: req.headers });

	// Define a variable to store the Blob data
	let blobData = null;

	// Listen to the 'file' event to get Blob data
	bb.on('file', (fieldname, file, filename, encoding, mimetype) => {
		// Set the blobData variable with the file buffer
		file.on('data', (data) => {
			if (!blobData) {
				blobData = data;
			} else {
				blobData = Buffer.concat([blobData, data]);
			}
		});
	});

	// Listen to the 'finish' event when file upload is complete
	bb.on('finish', () => {
		if (blobData) {
			// Generate a unique filename
			const fileName = `${Date.now()}-${Math.random()
				.toString(36)
				.substring(2, 8)}.mp4`;

			// Define the file path for the original Blob data
			const originalFilePath = path.join(uploadDir, fileName);

			// Write the Blob data to a file
			fs.writeFile(originalFilePath, blobData, (err) => {
				if (err) {
					console.error('Error saving Blob to file:', err);
					res.status(500).json({ error: 'Error saving Blob to file' });
				} else {
					console.log('Blob saved to file:', originalFilePath);

					// Convert the original Blob to MP4 format
					const mp4FilePath = path.join(
						uploadDir,
						`${Date.now()}-${Math.random()
							.toString(36)
							.substring(2, 8)}-output.mp4`
					);
					ffmpeg()
						.input(originalFilePath)
						.output(mp4FilePath)
						.on('end', () => {
							console.log('Conversion to MP4 complete.');
							pool.query(
								`UPDATE uploaded_files
                          SET file_name = $1, file_path= $2
                          WHERE user_id = $3;`,
								[fileName, mp4FilePath, userId],

								(error, results) => {
									if (error) {
										console.error('Error inserting into database:', error);
										res
											.status(500)
											.json({ error: 'Error inserting into database' });
									} else {
										console.log('File information inserted into database.');
										res.status(200).json({
											message:
												'Blob saved, converted, and database updated successfully',
										});
									}
								}
							);
							res.status(200).json({
								message: 'Blob saved and converted to MP4 successfully',
							});
						})
						.on('error', (err) => {
							console.error('Error converting Blob to MP4:', err);
							res.status(500).json({ error: 'Error converting Blob to MP4' });
						})
						.run();
				}
			});
		} else {
			res.status(400).json({ error: 'No Blob data received' });
		}
	});

	// Pipe the request to Busboy
	req.pipe(bb);
});

app.get('/videos', (req, res) => {
	const userId = req.query.id;

	pool.query(
		`SELECT * FROM uploaded_files
WHERE user_id=$1;`,
		[userId],

		(error, results) => {
			if (error) {
				console.error('Error inserting into database:', error);
				res.status(500).json({ error: 'Error inserting into database' });
			} else if (!results.rows) {
				console.error('Error inserting into database:', error);
				res.status(500).json({ error: 'Error inserting into database' });
			} else {
				console.log(results);
				console.log('File information inserted into database.');
				res.status(200).json(results.rows);
			}
		}
	);
});

// Create a video file
// Collect video stream
// Return data
