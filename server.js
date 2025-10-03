const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Database path - Render provides persistent storage
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'marksportal.db');

// Initialize database tables - MUST BE DEFINED BEFORE db CONNECTION
function initializeDatabase() {
    // Students table
    db.run(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reg_number TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        year TEXT NOT NULL,
        department TEXT NOT NULL,
        section TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Subjects table
    db.run(`CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year TEXT NOT NULL,
        department TEXT NOT NULL,
        semester TEXT NOT NULL,
        subject_code TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, department, subject_code)
    )`);

    // Marks table
    db.run(`CREATE TABLE IF NOT EXISTS marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        subject_code TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        assessment_type TEXT NOT NULL,
        marks INTEGER NOT NULL,
        academic_year TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students (id),
        UNIQUE(student_id, subject_code, assessment_type, academic_year)
    )`);
    
    console.log('Database tables initialized');
}

// Database connection - MUST COME AFTER initializeDatabase function
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database at:', dbPath);
        initializeDatabase();
    }
});

// API Routes for Students
app.get('/api/students', (req, res) => {
    const { year, department, section } = req.query;
    
    let query = `SELECT * FROM students`;
    let params = [];
    
    if (year && department && section) {
        query += ` WHERE year = ? AND department = ? AND section = ?`;
        params = [year, department, section];
    } else if (year && department) {
        query += ` WHERE year = ? AND department = ?`;
        params = [year, department];
    }
    
    query += ` ORDER BY created_at DESC LIMIT 10`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ students: rows });
    });
});

app.post('/api/students', (req, res) => {
    const { reg_number, full_name, year, department, section, category } = req.body;
    
    db.run(`INSERT INTO students (reg_number, full_name, year, department, section, category) 
            VALUES (?, ?, ?, ?, ?, ?)`,
        [reg_number, full_name, year, department, section, category],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.json({
                message: 'Student added successfully',
                data: { id: this.lastID }
            });
        });
});

app.delete('/api/students/:id', (req, res) => {
    const id = req.params.id;
    
    db.run(`DELETE FROM students WHERE id = ?`, id, function(err) {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ message: 'Student deleted successfully' });
    });
});

// API Routes for Subjects
app.get('/api/subjects', (req, res) => {
    const { year, department } = req.query;
    
    let query = `SELECT * FROM subjects`;
    let params = [];
    
    if (year && department) {
        query += ` WHERE year = ? AND department = ?`;
        params = [year, department];
    }
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ subjects: rows });
    });
});

app.post('/api/subjects', (req, res) => {
    const { year, department, semester, subject_code, subject_name } = req.body;
    
    db.run(`INSERT INTO subjects (year, department, semester, subject_code, subject_name) 
            VALUES (?, ?, ?, ?, ?)`,
        [year, department, semester, subject_code, subject_name],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.json({
                message: 'Subject added successfully',
                data: { id: this.lastID }
            });
        });
});

app.delete('/api/subjects/:id', (req, res) => {
    const id = req.params.id;
    
    db.run(`DELETE FROM subjects WHERE id = ?`, id, function(err) {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ message: 'Subject deleted successfully' });
    });
});

// API Routes for Marks
app.get('/api/marks', (req, res) => {
    const { assessment_type, year, department, section, subject_code } = req.query;
    
    let query = `
        SELECT m.*, s.reg_number, s.full_name, s.category 
        FROM marks m 
        JOIN students s ON m.student_id = s.id 
        WHERE m.assessment_type = ? AND m.academic_year = ? 
        AND s.department = ? AND s.section = ? AND m.subject_code = ?
    `;
    
    db.all(query, [assessment_type, year, department, section, subject_code], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ marks: rows });
    });
});

app.post('/api/marks/bulk', (req, res) => {
    const { marks } = req.body;
    
    const stmt = db.prepare(`INSERT OR REPLACE INTO marks 
                            (student_id, subject_code, subject_name, assessment_type, marks, academic_year) 
                            VALUES (?, ?, ?, ?, ?, ?)`);
    
    marks.forEach(mark => {
        stmt.run([mark.student_id, mark.subject_code, mark.subject_name, 
                 mark.assessment_type, mark.marks, mark.academic_year]);
    });
    
    stmt.finalize((err) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ message: 'All marks saved successfully' });
    });
});

// Dashboard Statistics
app.get('/api/dashboard/stats', (req, res) => {
    const queries = {
        totalStudents: 'SELECT COUNT(*) as count FROM students',
        totalSubjects: 'SELECT COUNT(*) as count FROM subjects',
        totalMarksEntries: 'SELECT COUNT(*) as count FROM marks'
    };
    
    db.get(queries.totalStudents, (err, studentCount) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        
        db.get(queries.totalSubjects, (err, subjectCount) => {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            
            db.get(queries.totalMarksEntries, (err, marksCount) => {
                if (err) {
                    res.status(400).json({ error: err.message });
                    return;
                }
                
                res.json({
                    totalStudents: studentCount.count,
                    totalSubjects: subjectCount.count,
                    totalMarksEntries: marksCount.count
                });
            });
        });
    });
});

// Report Generation API
app.get('/api/reports/performance', (req, res) => {
    const { assessment_type, year, department, section, subject_code } = req.query;
    
    let sectionCondition = '';
    let params = [];
    
    if (section !== 'all') {
        sectionCondition = 'AND s.section = ?';
        params = [assessment_type, year, department, section, subject_code];
    } else {
        params = [assessment_type, year, department, subject_code];
    }
    
    const query = `
        SELECT s.category, 
               COUNT(*) as total,
               SUM(CASE WHEN m.marks >= 40 THEN 1 ELSE 0 END) as pass,
               SUM(CASE WHEN m.marks < 40 THEN 1 ELSE 0 END) as fail
        FROM marks m
        JOIN students s ON m.student_id = s.id
        WHERE m.assessment_type = ? 
          AND m.academic_year = ? 
          AND s.department = ? 
          ${sectionCondition}
          AND m.subject_code = ?
        GROUP BY s.category
    `;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        
        // Calculate totals
        const totals = rows.reduce((acc, row) => {
            acc.total += row.total;
            acc.pass += row.pass;
            acc.fail += row.fail;
            return acc;
        }, { total: 0, pass: 0, fail: 0 });
        
        res.json({
            categoryStats: rows,
            totals: totals,
            passPercentage: totals.total > 0 ? ((totals.pass / totals.total) * 100).toFixed(2) : 0
        });
    });
});

// Get students for marks entry
app.get('/api/students/class', (req, res) => {
    const { year, department, section } = req.query;
    
    if (!year || !department || !section) {
        res.status(400).json({ error: 'Year, department, and section are required' });
        return;
    }
    
    const query = `SELECT * FROM students WHERE year = ? AND department = ? AND section = ?`;
    
    db.all(query, [year, department, section], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ students: rows });
    });
});

// Serve React app for any other requests
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access your application at: http://localhost:${PORT}`);
});