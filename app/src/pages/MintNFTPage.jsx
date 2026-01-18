import { useState } from 'react';
import MintOneOfOne from '../components/MintOneOfOne';
import CreateCollection from '../components/CreateCollection';

const MintNFTPage = () => {
    const [activeTab, setActiveTab] = useState('1-of-1');

    return (
        <div className="page-container">
            <h1>Mint NFT</h1>
            <div className="tabs">
                <button
                    className={activeTab === '1-of-1' ? 'active' : ''}
                    onClick={() => setActiveTab('1-of-1')}
                >
                    Mint 1-of-1
                </button>
                <button
                    className={activeTab === 'collection' ? 'active' : ''}
                    onClick={() => setActiveTab('collection')}
                >
                    Create Collection (Candy Machine)
                </button>
            </div>

            <div className="tab-content">
                {activeTab === '1-of-1' ? <MintOneOfOne /> : <CreateCollection />}
            </div>
        </div>
    );
};

export default MintNFTPage;
