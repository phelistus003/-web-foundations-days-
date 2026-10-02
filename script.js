let notes = [
    { id: 1, text: "Buy milk and bread", category: "personal" },
    { id: 2, text: "Finish the Day 3 assignment", category: "study" },
    { id: 3, text: "Email the project report to Grace", category: "work" },
    { id: 4, text: "Revise JavaScript arrays", category: "study" },
    { id: 5, text: "Call mum", category: "personal" },
];
function searchNotes(word) {
    return notes.filter(note =>
        note.text.toLowerCase().includes(word.toLowerCase())
    );
}
function longestNote() {
    if (notes.length === 0) {
        return null;
    }

    let longest = notes[0];

    for (let note of notes) {
        if (note.text.length > longest.text.length) {
            longest = note;
        }
    }

    return longest;
}
function longestNote() {
    if (notes.length === 0) {
        return null;
    }

    let longest = notes[0];

    for (let note of notes) {
        if (note.text.length > longest.text.length) {
            longest = note;
        }
    }

    return longest;
}
function getSummary() {
    let counts = countByCategory();

    return `${notes.length} notes: ${counts.personal} personal, ${counts.work} work, ${counts.study} study.`;
}
function isDuplicate(text) {
    let normalizedText = text.trim().replace(/\s+/g, " ").toLowerCase();

    return notes.some(note =>
        note.text.trim().replace(/\s+/g, " ").toLowerCase() === normalizedText
    );
}
function addNote(text, category) {
    if (text.trim().length < 1 || text.trim().length > 200) {
        console.log("Note must be between 1 and 200 characters.");
        return false;
    }

    if (isDuplicate(text)) {
        console.log("Note already exists.");
        return false;
    }

    if (!["personal", "work", "study"].includes(category)) {
        console.log("Invalid category.");
        return false;
    }

    let newNote = {
        id: notes.length + 1,
        text: text.trim(),
        category: category
    };

    notes.push(newNote);

    console.log("Note added successfully.");
    return true;
}
function addNote(text, category) {
    if (text.trim().length < 1 || text.trim().length > 200) {
        console.log("Note must be between 1 and 200 characters.");
        return false;
    }

    if (isDuplicate(text)) {
        console.log("Note already exists.");
        return false;
    }

    if (!["personal", "work", "study"].includes(category)) {
        console.log("Invalid category.");
        return false;
    }

    let newNote = {
        id: notes.length + 1,
        text: text.trim(),
        category: category
    };

    notes.push(newNote);

    console.log("Note added successfully.");
    return true;
}