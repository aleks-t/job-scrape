let allJobs = [];
let filteredJobs = [];
let currentPage = 1;
const jobsPerPage = 20;

// Load jobs on page load
async function loadJobs() {
    try {
        const response = await fetch('/api/jobs');
        const data = await response.json();
        
        allJobs = data.jobs || [];
        
        // Update stats
        document.getElementById('job-count').textContent = `${data.count || 0} jobs`;
        
        if (data.lastUpdated) {
            const date = new Date(data.lastUpdated);
            document.getElementById('last-updated').textContent = 
                `Updated ${formatTimeAgo(date)}`;
        }
        
        // Hide loading
        document.getElementById('loading').style.display = 'none';
        
        // Apply filters and render
        applyFilters();
        
    } catch (err) {
        console.error('Error loading jobs:', err);
        document.getElementById('loading').innerHTML = 
            '<p>Error loading jobs. Please refresh the page.</p>';
    }
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    
    return date.toLocaleDateString();
}

function applyFilters() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const sourceFilter = document.getElementById('source-filter').value;
    const sortBy = document.getElementById('sort-by').value;
    
    // Filter jobs
    filteredJobs = allJobs.filter(job => {
        const matchesSearch = !searchTerm || 
            job.title.toLowerCase().includes(searchTerm) ||
            job.organization.toLowerCase().includes(searchTerm) ||
            (job.locationName && job.locationName.toLowerCase().includes(searchTerm));
        
        const matchesSource = sourceFilter === 'all' || job.source === sourceFilter;
        
        return matchesSearch && matchesSource;
    });
    
    // Sort jobs
    filteredJobs.sort((a, b) => {
        switch (sortBy) {
            case 'title':
                return a.title.localeCompare(b.title);
            case 'company':
                return a.organization.localeCompare(b.organization);
            default: // recent
                return 0; // Keep original order
        }
    });
    
    // Reset to page 1
    currentPage = 1;
    
    // Render jobs
    renderJobs();
}

function renderJobs() {
    const container = document.getElementById('jobs-container');
    const noResults = document.getElementById('no-results');
    
    if (filteredJobs.length === 0) {
        container.innerHTML = '';
        noResults.style.display = 'block';
        updatePagination();
        return;
    }
    
    noResults.style.display = 'none';
    
    // Calculate pagination
    const startIdx = (currentPage - 1) * jobsPerPage;
    const endIdx = startIdx + jobsPerPage;
    const pageJobs = filteredJobs.slice(startIdx, endIdx);
    
    // Render job cards
    container.innerHTML = pageJobs.map(job => createJobCard(job)).join('');
    
    // Add click handlers
    document.querySelectorAll('.job-card').forEach((card, idx) => {
        const job = pageJobs[idx];
        const expandBtn = card.querySelector('.btn-expand');
        
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleJobDescription(card, expandBtn);
        });
    });
    
    updatePagination();
}

function createJobCard(job) {
    const hasDescription = job.description && job.description.trim().length > 0;
    const compensation = job.compensation || '';
    
    return `
        <div class="job-card">
            <div class="job-header">
                <div class="job-title-section">
                    <h2 class="job-title">${escapeHtml(job.title)}</h2>
                    <div class="job-company">${escapeHtml(job.organization)}</div>
                </div>
                <span class="job-source">${job.source}</span>
            </div>
            
            <div class="job-meta">
                ${job.locationName ? `<span>📍 ${escapeHtml(job.locationName)}</span>` : ''}
                ${job.workplaceType ? `<span>💼 ${escapeHtml(job.workplaceType)}</span>` : ''}
                ${job.employmentType ? `<span>⏰ ${escapeHtml(job.employmentType)}</span>` : ''}
            </div>
            
            ${compensation ? `<div class="job-compensation">💰 ${escapeHtml(compensation)}</div>` : ''}
            
            <div class="job-actions">
                ${hasDescription ? '<button class="btn-expand">📖 View Description</button>' : ''}
                <a href="${escapeHtml(job.url)}" target="_blank" class="btn-apply">Apply Now →</a>
            </div>
            
            ${hasDescription ? `
                <div class="job-description">
                    <p>${escapeHtml(job.description)}</p>
                </div>
            ` : ''}
        </div>
    `;
}

function toggleJobDescription(card, btn) {
    const description = card.querySelector('.job-description');
    
    if (!description) return;
    
    const isExpanded = description.classList.contains('expanded');
    
    if (isExpanded) {
        description.classList.remove('expanded');
        btn.textContent = '📖 View Description';
        card.classList.remove('expanded');
    } else {
        description.classList.add('expanded');
        btn.textContent = '📕 Hide Description';
        card.classList.add('expanded');
    }
}

function updatePagination() {
    const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);
    
    document.getElementById('page-info').textContent = 
        totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : 'No results';
    
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners
document.getElementById('search').addEventListener('input', applyFilters);
document.getElementById('source-filter').addEventListener('change', applyFilters);
document.getElementById('sort-by').addEventListener('change', applyFilters);

document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderJobs();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

document.getElementById('next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderJobs();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

document.getElementById('refresh-btn').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Scraping...';
    
    try {
        await fetch('/api/scrape', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days: 1 })
        });
        
        // Poll for completion
        const checkInterval = setInterval(async () => {
            const status = await fetch('/api/status').then(r => r.json());
            
            if (!status.isRunning) {
                clearInterval(checkInterval);
                btn.disabled = false;
                btn.textContent = '🔄 Refresh Data';
                
                // Reload jobs
                await loadJobs();
            }
        }, 3000);
        
    } catch (err) {
        console.error('Error triggering scraper:', err);
        btn.disabled = false;
        btn.textContent = '🔄 Refresh Data';
    }
});

// Load jobs on page load
loadJobs();

