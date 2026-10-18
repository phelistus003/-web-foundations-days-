PRAGMA foreign_keys = ON;

-- Tables

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  course_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE enrolments (
  enrolment_id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  grade TEXT,
  FOREIGN KEY (student_id) REFERENCES students (student_id),
  FOREIGN KEY (course_id) REFERENCES courses (course_id),
  UNIQUE (student_id, course_id)
);

-- Sample data

INSERT INTO students (name, email) VALUES
  ('Amina Otieno', 'amina@example.com'),
  ('Brian Kamau', 'brian@example.com'),
  ('Cynthia Wanjiru', 'cynthia@example.com'),
  ('David Mwangi', 'david@example.com');

INSERT INTO courses (title) VALUES
  ('Databases'),
  ('Web Development'),
  ('Python Basics');

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 'B'),
  (1, 2, 'A'),
  (2, 1, 'C'),
  (3, 2, 'B'),
  (3, 3, NULL);

-- Query 1: all courses for one student (by name)
SELECT courses.title
FROM students
JOIN enrolments ON enrolments.student_id = students.student_id
JOIN courses ON courses.course_id = enrolments.course_id
WHERE students.name = 'Amina Otieno';

-- Query 2: all students on one course
SELECT students.name
FROM courses
JOIN enrolments ON enrolments.course_id = courses.course_id
JOIN students ON students.student_id = enrolments.student_id
WHERE courses.title = 'Databases';

-- Query 3: number of students per course
SELECT courses.title, COUNT(enrolments.enrolment_id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.course_id
GROUP BY courses.course_id, courses.title;

-- Query 4: students who have no enrolments
SELECT students.name
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.student_id
WHERE enrolments.enrolment_id IS NULL;

-- Query 5: update one enrolment's grade
UPDATE enrolments
SET grade = 'A'
WHERE student_id = 2 AND course_id = 1;