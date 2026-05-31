-- Call analytics: high-volume CDR-style records keyed by remote party number

CREATE TABLE call_analytics (
    id BIGSERIAL PRIMARY KEY,
    remote_party_number VARCHAR(32) NOT NULL,
    called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Point lookups and GROUP BY remote_party_number
CREATE INDEX idx_call_analytics_remote_party ON call_analytics (remote_party_number);

-- MAX(called_at) per number without sorting the full history
CREATE INDEX idx_call_analytics_remote_party_called_at
    ON call_analytics (remote_party_number, called_at DESC);
