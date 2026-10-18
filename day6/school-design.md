# School Database Design

## Tables

### students
Stores one row per student. It has a `student_id` (primary key), a `name` (required) and an `email` (required and unique, so two students cannot share the same email address).

### courses
Stores one row per course. It has a `course_id` (primary key) and a `title` (required).

### enrolments
Stores the fact that a student is enrolled on a course. Each row has its own `enrolment_id` (primary key), a `student_id` and a `course_id` (both foreign keys and required), and a `grade` (optional, because a grade does not exist until the course is marked). A `UNIQUE (student_id, course_id)` rule stops the same student from enrolling on the same course twice.

## Relationships

- **One student to many enrolments (one-to-many):** one student can have many enrolment rows, but each enrolment row belongs to one student.
- **One course to many enrolments (one-to-many):** one course can have many enrolment rows, but each enrolment row belongs to one course.
- **Students to courses (many-to-many):** a student can take many courses, and a course can have many students. This is the many-to-many relationship, and it exists through the `enrolments` table.

### Why a join table is needed

A single column cannot hold many values properly. If `students` had a `courses` column, it would have to store a list, which breaks the rules of a relational table. Putting `student_id` inside `courses` would have the same problem. The `enrolments` table solves this by turning one many-to-many relationship into two one-to-many relationships. Each row links exactly one student to exactly one course, and it is also a natural place to store the grade, because the grade belongs to the pairing and not to the student or the course alone.

## Index

I would add an index on `enrolments(course_id)`:

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments (course_id);
```

The `UNIQUE (student_id, course_id)` rule already creates an index that helps when searching by student. It does not help when searching by course alone. Queries like "all students on one course" and "number of students per course" filter and group by `course_id`, so without this index the database would have to read every enrolment row. The index lets it jump straight to the matching rows, which matters as the table grows.

## SQL or NoSQL

I would choose SQL for this system. The data is highly structured and full of relationships: students, courses and enrolments always link to each other in the same way. SQL enforces those links with foreign keys, and rules such as unique emails and no duplicate enrolments are protected by the database itself rather than by application code. Queries that join tables, such as finding every course for a student or counting students per course, are simple and fast in SQL. A NoSQL database would be more useful if the data had no fixed shape or needed to scale across many servers, but a school system does not need that, and it would lose the guarantees about consistent, connected data.