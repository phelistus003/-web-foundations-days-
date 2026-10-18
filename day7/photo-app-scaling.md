# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from people they follow.

## Assumptions

- 10,000,000 registered users.
- 10% of registered users are active each day.
- Each active user uploads 1 photo per day.
- Each active user views 50 feed pages per day, and one feed page view counts as one request.
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail.
- One day has 86,400 seconds, and traffic is spread evenly across it for the average.
- Peak traffic is 5 times the average.
- Storage uses decimal units (1 TB = 1,000,000 MB) and ignores backups and deleted photos.

## Daily active users

10,000,000 registered users x 10% = **1,000,000 daily active users (DAU)**.

## Estimates

### Uploads per second
- Uploads per day: 1,000,000 x 1 = 1,000,000
- Average: 1,000,000 / 86,400 = **about 11.6 uploads per second**
- Peak (5x): **about 58 uploads per second**

### Feed views per second
- Feed views per day: 1,000,000 x 50 = 50,000,000
- Average: 50,000,000 / 86,400 = **about 579 feed views per second**
- Peak (5x): **about 2,900 feed views per second**

### Photo storage per year
- Originals per day: 1,000,000 x 2 MB = 2 TB
- Thumbnails per day: 1,000,000 x 50 KB = 50 GB
- Originals per year: 2 TB x 365 = **730 TB**
- Thumbnails per year: 50 GB x 365 = **about 18 TB**
- Total per year: **about 748 TB (roughly 0.75 PB)**

## Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are 50,000,000 feed views per day but only 1,000,000 uploads per day, so there are about 50 reads for every write.

What this means for the design:

- Most of the effort goes into making reads fast and cheap, using a CDN, a cache and a read replica.
- Writes are rare enough that one primary database can handle them for now.
- Some data can be slightly out of date (for example, a new photo appearing a few seconds late in a feed), because speed matters more than instant freshness.

## Why photos should not be stored in the database

A database is built for small, structured records that are searched and joined, not for large files. At 730 TB per year, photos inside the database would make it enormous, slow to back up, slow to replicate to the read replica, and expensive, because database storage costs far more per GB than file storage. Every photo download would also tie up a database connection, and a CDN cannot serve files straight from a database.

Photos should go in **object storage**, which is cheap, very durable and built for huge numbers of large files. The database stores only a small record for each photo, such as the photo id, the owner, the time, and the key (path) that points to the file in object storage.

## Architecture diagram

```
                 Users (mobile app / browser)
                    |                  |
       photo files  |                  |  API requests
                    v                  v
             +-------------+    +-----------------+
             |     CDN     |    |  Load Balancer  |
             +------+------+    +--------+--------+
                    |                    |
          cache miss|          +---------+---------+
                    |          |         |         |
                    |     +----v---+ +---v----+ +--v-----+
                    |     |  App   | |  App   | |  App   |
                    |     | Server | | Server | | Server |
                    |     +----+---+ +---+----+ +--+-----+
                    |          |         |         |
                    |          +---------+---------+
                    |                    |
                    |     +--------------+--------------+
                    |     |              |              |
                    |     v              v              v
                    |  +-------+   +-----------+   +---------+
                    |  | Cache |   | Database  |   |  Queue  |
                    |  |(Redis)|   | (primary) |   +----+----+
                    |  +-------+   +-----+-----+        |
                    |                    |              v
                    |            replication      +-----------+
                    |                    v         |  Worker   |
                    |             +-----------+    | (thumb-   |
                    |             |   Read    |    |  nails)   |
                    |             |  Replica  |    +-----+-----+
                    |             +-----------+          |
                    v                                    |
             +----------------+<-------------------------+
             | Object Storage |
             | (photos+thumbs)|<---- app servers also save original photos here
             +----------------+
```

How to read it: photo files are requested through the CDN, which fetches from object storage on a cache miss. Everything else (login, upload, feed) goes through the load balancer to the app servers. The app servers read feed data from the cache or the read replica, write to the primary database, save original photos in object storage, and put thumbnail jobs on the queue.

## Components

- **CDN:** serves photos and thumbnails from servers close to the user, so most of the heavy photo traffic never reaches SnapShare's own servers.
- **Load balancer:** spreads incoming requests across the app servers and stops sending traffic to a server that has failed.
- **App servers:** run SnapShare's logic (login, upload, feed), and more of them can be added when traffic grows.
- **Cache:** keeps frequently read data, such as popular feeds, in memory so the database is not asked the same question again and again.
- **Database (primary):** stores users, follows and photo records, and receives all the writes.
- **Read replica:** a copy of the database that answers read queries, which takes load off the primary.
- **Object storage:** stores the photo and thumbnail files cheaply and durably at very large scale.
- **Queue:** holds thumbnail jobs so the user does not have to wait for them during an upload.
- **Worker:** picks jobs from the queue and creates the thumbnails in the background.

## Upload flow

1. The user chooses a photo and the app sends the upload request through the load balancer to an app server.
2. The app server checks that the user is logged in and that the file is an allowed type and size.
3. The app server saves the original photo in object storage and gets back its key.
4. The app server writes a record to the primary database (photo id, owner, key, time, status "processing").
5. The app server adds a "create thumbnail" job to the queue and immediately tells the user the upload succeeded.
6. A worker takes the job from the queue, reads the original from object storage, and creates a 50 KB thumbnail.
7. The worker saves the thumbnail in object storage, then updates the database record with the thumbnail key and the status "ready".
8. When followers next load their feed, the app servers read the photo records from the cache or the read replica, and the thumbnails are served through the CDN.

## Trade-offs

1. **Cache and read replica: speed versus freshness.** They make feeds fast and protect the primary database, but data can be slightly stale because of replication lag, and cached entries must be cleared or updated when data changes, which adds complexity.
2. **Queue and worker: fast uploads versus delayed thumbnails.** The user gets a quick response because thumbnails are made in the background, but a new photo may have no thumbnail for a few seconds (the app needs a placeholder), and the queue and worker are extra parts to run and monitor.
3. **CDN: speed and savings versus cost and control.** It cuts latency and server load for photo traffic, but it costs money, and a deleted or replaced photo can keep appearing until the cached copy expires or is purged.
4. **Object storage instead of the database: cost and scale versus consistency.** It is much cheaper and scales to hundreds of terabytes, but the database record and the file live in two systems, so they can get out of step (for example, a record with no file if an upload fails halfway).