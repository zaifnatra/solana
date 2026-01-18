import React from 'react';

const MOCK_POSTS = [
    {
        id: 1,
        artistName: 'The Bagels',
        avatar: 'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
        content: 'Just dropped a new demo for our token holders! Check your rewards tab. 🥯',
        time: '2h ago'
    },
    {
        id: 2,
        artistName: 'Visuals by Sarah',
        avatar: 'https://images.unsplash.com/photo-1460661631562-b628fff5db9a?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
        content: 'Thanks to everyone who bought shares in the genesis drop! Working on the exclusive prints now.',
        time: '5h ago'
    }
];

const SocialFeed = () => {
    return (
        <div style={{ borderLeft: '1px solid #333', paddingLeft: '20px', marginLeft: '20px', minWidth: '300px' }}>
            <h3>Artist Updates</h3>
            {MOCK_POSTS.map(post => (
                <div key={post.id} style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #222' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                        <img src={post.avatar} style={{ width: '30px', height: '30px', borderRadius: '50%' }} />
                        <span style={{ fontWeight: 'bold', fontSize: '0.9em' }}>{post.artistName}</span>
                        <span style={{ color: '#666', fontSize: '0.8em' }}>• {post.time}</span>
                    </div>
                    <p style={{ fontSize: '0.9em', margin: 0, lineHeight: '1.4' }}>{post.content}</p>
                </div>
            ))}
        </div>
    );
};

export default SocialFeed;
